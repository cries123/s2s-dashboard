import React, { useState, useMemo, useEffect } from 'react';
import { Search, Users, ChevronRight } from 'lucide-react';
import { Customer, User } from '../../../types';
import { cn } from '../../../lib/utils';
import { PageHeader } from '../../layout/PageHeader';
import { DataTable } from '../../ui/DataTable';
import { EmptyState } from '../../ui/EmptyState';
import {
  directoryMakeFiltersForDealership,
  DirectoryMakeFilter,
  matchesDirectoryMakeFilter,
} from '../../../lib/directoryMakeFilters';
import { formatCustomerDisplayName } from '../../../lib/customerName';
import { useServiceAlertHelpers } from '../../../context/ServiceAlertContext';
import { describeCustomerAlert } from '../../../lib/alertPresentation';
import { tidyCase } from '../../ui/Panel';

interface CustomerDirectoryProps {
  customers: Customer[];
  currentUser: User;
  currentDealershipId: string;
  onViewProfile: (customer: Customer) => void;
  onViewLog: (customer: Customer) => void;
  onRefresh: (msg: string, isError?: boolean) => void;
}

export const CustomerDirectory: React.FC<CustomerDirectoryProps> = ({
  customers,
  currentUser,
  currentDealershipId,
  onViewProfile,
  onViewLog,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(24);
  const [filterCategory, setFilterCategory] = useState<DirectoryMakeFilter>('All');
  const [sortBy, setSortBy] = useState<'Recent' | 'Visits'>('Recent');
  const serviceAlerts = useServiceAlertHelpers();

  const makeFilters = useMemo(
    () => directoryMakeFiltersForDealership(currentDealershipId),
    [currentDealershipId]
  );

  useEffect(() => {
    if (!makeFilters.includes(filterCategory)) {
      setFilterCategory('All');
    }
  }, [makeFilters, filterCategory]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    
    let result = customers.filter(c => {
      const matchesSearch = !q || (
        c.firstName?.toLowerCase().includes(q) ||
        c.lastName?.toLowerCase().includes(q) ||
        c.vinLast8?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.model?.toLowerCase().includes(q)
      );

      const matchesCategory = filterCategory === 'All' || 
        (filterCategory === 'Hyundai' && c.make?.toLowerCase().includes('hyundai')) ||
        (filterCategory === 'Other' && !c.make?.toLowerCase().includes('hyundai'));

      return matchesSearch && matchesCategory;
    });

    // Helper for date parsing
    const getTime = (d: string | undefined | any) => {
      if (!d) return 0;
      if (typeof d === 'object' && d?.toDate) return d.toDate().getTime(); // Handle Timestamp
      const date = new Date(d);
      return isNaN(date.getTime()) ? 0 : date.getTime();
    };

    // Apply Sorting
    return result.sort((a, b) => {
      if (sortBy === 'Recent') {
        const timeA = getTime(a.lastServiceDate);
        const timeB = getTime(b.lastServiceDate);
        if (timeB !== timeA) return timeB - timeA; // Newest first
        return a.lastName.localeCompare(b.lastName);
      }
      
      if (sortBy === 'Visits') {
        const countA = a.recentVisits?.length || 0;
        const countB = b.recentVisits?.length || 0;
        if (countB !== countA) return countB - countA; // Most visited first
        
        // Priority Tie-breaker: Who was here most recently?
        const timeA = getTime(a.lastServiceDate);
        const timeB = getTime(b.lastServiceDate);
        if (timeB !== timeA) return timeB - timeA;

        return a.lastName.localeCompare(b.lastName);
      }

      return a.lastName.localeCompare(b.lastName);
    });
  }, [customers, searchQuery, filterCategory, sortBy]);

  const displayCustomers = useMemo(() => {
    return filteredCustomers.slice(0, visibleCount);
  }, [filteredCustomers, visibleCount]);

  const stats = useMemo(() => {
    let totalROs = 0;
    let maxROs = 0;
    let topCustomer: Customer | null = null;
    
    // Helper for date parsing in stats
    const getTime = (d: string | undefined | any) => {
      if (!d) return 0;
      if (typeof d === 'object' && d?.toDate) return d.toDate().getTime();
      const date = new Date(d);
      return isNaN(date.getTime()) ? 0 : date.getTime();
    };

    customers.forEach(c => {
      const visits = c.recentVisits?.length || 0;
      totalROs += visits;
      
      // Better Top Visitor logic with tie-breakers
      const isNewLeader = !topCustomer || 
        visits > maxROs || 
        (visits === maxROs && (
          getTime(c.lastServiceDate) > getTime(topCustomer.lastServiceDate) ||
          (getTime(c.lastServiceDate) === getTime(topCustomer.lastServiceDate) && 
           c.lastName.localeCompare(topCustomer.lastName) < 0)
        ));

      if (isNewLeader) {
        maxROs = visits;
        topCustomer = c;
      }
    });

    return { totalROs, topCustomer, maxROs };
  }, [customers]);

  const tableColumns = [
    {
      key: 'name',
      header: 'Customer',
      render: (c: Customer) => (
        <div>
          <p className="font-medium">{formatCustomerDisplayName(c.firstName, c.lastName)}</p>
          <p className="crm-label text-xs">{c.phone || 'No phone'}</p>
        </div>
      ),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      render: (c: Customer) => (
        <span className="text-sm">{c.year ? `${c.year} ` : ''}{c.make} {c.model}</span>
      ),
    },
    { key: 'vin', header: 'VIN (last 8)', render: (c: Customer) => <span className="font-mono text-xs">{c.vinLast8}</span> },
    {
      key: 'visits',
      header: 'Visits',
      className: 'text-right',
      render: (c: Customer) => <span className="tabular-nums">{c.recentVisits?.length || 0}</span>,
    },
    {
      key: 'last',
      header: 'Last service',
      render: (c: Customer) => (
        <span className="crm-label">{c.lastServiceDate ? String(c.lastServiceDate).slice(0, 10) : '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Customer directory"
        description={`${customers.length.toLocaleString()} customers · ${stats.totalROs.toLocaleString()} repair orders on file`}
        breadcrumbs={[{ label: 'Service' }, { label: 'Directory' }]}
        className="mb-2"
      />

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            type="search"
            placeholder="Search name, phone, VIN or model"
            aria-label="Search customers"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(24);
            }}
            className="input-field pl-9"
          />
        </div>
        <div className="flex gap-2">
          <div
            className="seg flex-1 lg:flex-none"
            style={{ gridTemplateColumns: `repeat(${makeFilters.length}, minmax(0, 1fr))` }}
            role="group"
            aria-label="Filter by make"
          >
            {makeFilters.map((cat) => (
              <button key={cat} type="button" aria-pressed={filterCategory === cat} onClick={() => setFilterCategory(cat)}>
                {cat}
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'Recent' | 'Visits')}
            className="input-field w-auto shrink-0"
            aria-label="Sort"
          >
            <option value="Recent">Recent</option>
            <option value="Visits">Most visits</option>
          </select>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <EmptyState
          title="No customers match"
          description="Try a different name, phone number or VIN."
          action={
            <button type="button" onClick={() => { setSearchQuery(''); setFilterCategory('All'); }} className="btn-secondary">
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="hidden lg:block">
            <DataTable columns={tableColumns} data={displayCustomers} rowKey={(c) => c.id} onRowClick={onViewProfile} />
          </div>

          {/* Phones and tablets: one row per customer. Calls, history and edits live on the profile. */}
          <div className="list-group lg:hidden">
            {displayCustomers.map((c) => {
              const alert = describeCustomerAlert(c, serviceAlerts.config);
              const showAlert = alert.tone === 'danger' || alert.tone === 'warning';
              const last = c.recentVisits?.[0]?.date;
              const lastLabel = last
                ? new Date(`${String(last).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : null;
              const initials = `${c.firstName?.[0] ?? ''}${c.lastName?.[0] ?? ''}`.toUpperCase() || '?';
              return (
                <button key={c.id} type="button" className="list-row" onClick={() => onViewProfile(c)}>
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
                    style={{ backgroundColor: '#ece1f9', color: '#5a1ba9' }}
                    aria-hidden="true"
                  >
                    {initials}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-primary truncate">
                      {formatCustomerDisplayName(c.firstName, c.lastName)}
                    </p>
                    <p className="crm-label truncate">
                      {[c.year, tidyCase(c.model)].filter(Boolean).join(' ') || 'No vehicle on file'}
                    </p>
                    <p className="crm-label truncate">
                      {showAlert ? (
                        <span
                          className="font-semibold"
                          style={{ color: alert.tone === 'danger' ? 'var(--color-badge-error-text)' : 'var(--color-badge-warn-text)' }}
                        >
                          Service {alert.label}
                        </span>
                      ) : lastLabel ? (
                        `Last in ${lastLabel}`
                      ) : (
                        'No visits on record'
                      )}
                    </p>
                  </div>
                  <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--color-text-tertiary)' }} />
                </button>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-2 pt-2 pb-6">
            <p className="crm-label">
              Showing {displayCustomers.length.toLocaleString()} of {filteredCustomers.length.toLocaleString()}
            </p>
            {filteredCustomers.length > visibleCount && (
              <button type="button" onClick={() => setVisibleCount((prev) => prev + 24)} className="btn-secondary">
                Show more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
