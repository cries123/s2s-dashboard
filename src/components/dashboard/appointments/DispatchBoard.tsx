import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../../hooks/useAuth';
import { Customer, DealershipSettings, DepartmentColumnId, DispatchRepairOrder } from '../../../types';
import { cn } from '../../../lib/utils';
import { mergeLaneCapacity, DispatchProductionLane } from '../../../lib/dispatchConfig';
import { findCustomersByLastName, enrichDispatchFromCustomer, displayCustomerLastName } from '../../../lib/dispatchCustomerMatch';
import {
  appointmentTrackerDoc,
  legacyAppointmentTrackerDoc,
  resolveAppointmentCount,
} from '../../../lib/appointmentTracker';
import { 
  Users, CheckCircle2, ClipboardList, AlertTriangle, HelpCircle, 
  Plus, Calendar, Sparkles, RefreshCw, Layers, CheckSquare, Trash2,
  GripVertical, Check, Wrench, Monitor, X, UserSearch, Inbox
} from 'lucide-react';

// 1. Color System Configuration & Status Tokens
export const DISPATCH_STATUS_COLORS = {
  WIP: { label: "Work In Progress", hex: "#FACC15", text: "#1E293B" },        // Yellow
  DIS: { label: "Down In Shop", hex: "#EF4444", text: "#FFFFFF" },           // Red
  POO: { label: "Parts on Order", hex: "#EC4899", text: "#FFFFFF" },         // Pink
  WFA: { label: "Waiting for Authorization", hex: "#F97316", text: "#FFFFFF" } // Orange
};

const DEPARTMENTS: { id: DepartmentColumnId; label: string; icon: any }[] = [
  { id: 'lube', label: 'Lube Unit', icon: Layers },
  { id: 'quick_service', label: 'Quick Service', icon: Sparkles },
  { id: 'ac_electrical', label: 'AC / Electrical', icon: AlertTriangle },
  { id: 'heavyline', label: 'Heavyline Core', icon: Users },
  { id: 'diesel', label: 'Diesel Power', icon: ClipboardList },
  { id: 'trans', label: 'Transmission', icon: RefreshCw },
  { id: 'mobile_repair', label: 'Mobile Fleet', icon: Wrench },
];

const DISPLAY_COLUMNS: { id: DepartmentColumnId; label: string; shortLabel: string; icon: typeof Layers }[] = [
  { id: 'unassigned', label: 'Waiting for Dispatch', shortLabel: 'Queue', icon: ClipboardList },
  ...DEPARTMENTS.map((d) => ({ ...d, shortLabel: d.label.split(' ')[0] })),
];

export function DispatchBoard({ 
  currentDealershipId,
  customers = [],
  showNotification
}: { 
  key?: string;
  currentDealershipId: string;
  customers?: Customer[];
  showNotification?: (msg: string, isError?: boolean) => void;
}) {
  const { user } = useAuth();
  
  // States of Active RO list
  const [orders, setOrders] = useState<DispatchRepairOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Drag & drop interactive feedback states
  const [draggedRoId, setDraggedRoId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<DepartmentColumnId | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Completed items view states
  const [showCompleted, setShowCompleted] = useState<boolean>(false);
  const [isDisplayMode, setIsDisplayMode] = useState<boolean>(false);

  // Form states
  const [roNumber, setRoNumber] = useState('');
  const [techNumber, setTechNumber] = useState('');
  const [customerLastName, setCustomerLastName] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [dealershipSettings, setDealershipSettings] = useState<Partial<DealershipSettings> | null>(null);
  const [todayApptCount, setTodayApptCount] = useState(0);
  const [initialStatus, setInitialStatus] = useState<'WIP' | 'DIS' | 'POO' | 'WFA'>('WIP');
  const [quickComplete, setQuickComplete] = useState(false);

  // Current YYYY-MM-DD Date
  const currentSystemDate = useMemo(() => {
    return new Date().toLocaleDateString('en-CA'); // Accurate timezone local YYYY-MM-DD
  }, []);

  useEffect(() => {
    if (!isDisplayMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDisplayMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [isDisplayMode]);

  const openDisplayMode = async () => {
    setShowCompleted(false);
    setIsDisplayMode(true);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen is optional; fixed overlay still works in-window.
    }
  };

  const closeDisplayMode = () => {
    setIsDisplayMode(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  };


  const laneCapacity = useMemo(
    () => mergeLaneCapacity(dealershipSettings?.dispatchLaneCapacity),
    [dealershipSettings?.dispatchLaneCapacity]
  );
  const showTodayLoad = dealershipSettings?.dispatchShowTodayLoad !== false;
  const blockWhenFull = !!dealershipSettings?.dispatchBlockWhenFull;
  const apptGoal = dealershipSettings?.appointmentTarget ?? 20;

  const matchCandidates = useMemo(
    () => findCustomersByLastName(customers, customerLastName),
    [customers, customerLastName]
  );

  useEffect(() => {
    if (!currentDealershipId) return;
    const settingsRef = doc(
      db,
      'artifacts',
      'hyundai-sales-to-service',
      'public',
      'data',
      'dealershipSettings',
      currentDealershipId
    );
    return onSnapshot(settingsRef, (snap) => {
      setDealershipSettings(snap.exists() ? (snap.data() as DealershipSettings) : null);
    });
  }, [currentDealershipId]);

  useEffect(() => {
    if (!currentDealershipId) return;

    let tenantData: { count?: number; dealershipId?: string } | null = null;
    let legacyData: { count?: number; dealershipId?: string } | null = null;

    const syncCount = () => {
      setTodayApptCount(
        resolveAppointmentCount(
          currentDealershipId,
          tenantData ?? undefined,
          legacyData ?? undefined
        )
      );
    };

    const unsubTenant = onSnapshot(
      appointmentTrackerDoc(db, currentDealershipId, currentSystemDate),
      (snap) => {
        tenantData = snap.exists() ? (snap.data() as { count?: number; dealershipId?: string }) : null;
        syncCount();
      }
    );

    const unsubLegacy =
      currentDealershipId === 'hyundai'
        ? onSnapshot(legacyAppointmentTrackerDoc(db, currentSystemDate), (snap) => {
            legacyData = snap.exists() ? (snap.data() as { count?: number; dealershipId?: string }) : null;
            syncCount();
          })
        : () => {};

    return () => {
      unsubTenant();
      unsubLegacy();
    };
  }, [currentDealershipId, currentSystemDate]);

  // Sync / Stream Board State from Firestore
  useEffect(() => {
    if (!currentDealershipId) return;
    
    setLoading(true);
    const path = 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders';
    const q = query(
      collection(db, path),
      where('dealershipId', '==', currentDealershipId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders: DispatchRepairOrder[] = [];
      snapshot.forEach((doc) => {
        fetchedOrders.push({
          ...(doc.data() as Omit<DispatchRepairOrder, 'id'>),
          id: doc.id
        });
      });

      setOrders(fetchedOrders);
      setLoading(false);

      // Rule C: Overnight carryover retention logic.
      // If any active (non-completed) ticket is from an earlier date and is not in 'unassigned', sweep it back.
      const carryoversToReset = fetchedOrders.filter(ro => {
        return !ro.isCompleted && ro.dateCreated < currentSystemDate && ro.department !== 'unassigned';
      });

      if (carryoversToReset.length > 0) {
        console.log(`[Dispatch] Rolling over ${carryoversToReset.length} overnight tickets back to the queue.`);
        
        // Batch update to reset their department
        const batch = writeBatch(db);
        carryoversToReset.forEach(ro => {
          const docRef = doc(db, path, ro.id);
          batch.update(docRef, {
            department: 'unassigned',
            lastUpdated: new Date().toISOString()
          });
        });
        
        batch.commit()
          .then(() => {
            if (showNotification) {
              showNotification(`Restored ${carryoversToReset.length} carryover ticket(s) back to the Waiting Dispatch tray.`);
            }
          })
          .catch(err => {
            console.error('[Dispatch] Error rolling over tickets:', err);
          });
      }

    }, (error) => {
      console.error('[Dispatch] Error streaming dispatch orders:', error);
      setLoading(false);
      if (showNotification) {
        showNotification('Error loading Dispatch Board data from server.', true);
      }
    });

    return () => unsubscribe();
  }, [currentDealershipId, currentSystemDate]);

  // Handle Drag Events
  const handleDragStart = (e: React.DragEvent, roId: string) => {
    setDraggedRoId(roId);
    e.dataTransfer.setData('text/plain', roId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedRoId(null);
    setOverColumnId(null);
  };

  const handleDragOver = (e: React.DragEvent, columnId: DepartmentColumnId) => {
    e.preventDefault();
    if (overColumnId !== columnId) {
      setOverColumnId(columnId);
    }
  };

  const handleDragLeave = () => {
    setOverColumnId(null);
  };

  // Rule B: Complete state transition and database mutation
  const countInLane = (lane: DepartmentColumnId, excludeId?: string) =>
    (orders.filter((o) => !o.isCompleted && o.department === lane && o.id !== excludeId)).length;

  const isLaneAtCapacity = (lane: DepartmentColumnId, excludeId?: string) => {
    if (lane === 'unassigned') return false;
    const cap = laneCapacity[lane as DispatchProductionLane];
    if (!cap || cap <= 0) return false;
    return countInLane(lane, excludeId) >= cap;
  };

  const handleCardDropped = async (roId: string, targetLane: DepartmentColumnId) => {
    if (!roId) return;
    if (blockWhenFull && targetLane !== 'unassigned' && isLaneAtCapacity(targetLane, roId)) {
      showNotification?.(`${DEPARTMENTS.find((d) => d.id === targetLane)?.label || 'Lane'} is at capacity.`, true);
      return;
    }
    try {
      const roRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', roId);
      await updateDoc(roRef, {
        department: targetLane,
        lastUpdated: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Dispatch] Drop mutation error:', err);
      if (showNotification) {
        showNotification('Failed to route dispatch card.', true);
      }
    }
  };

  const handleDrop = (e: React.DragEvent, targetLane: DepartmentColumnId) => {
    e.preventDefault();
    const roId = e.dataTransfer.getData('text/plain');
    handleCardDropped(roId, targetLane);
    setOverColumnId(null);
    setDraggedRoId(null);
  };

  // Rule A Form submission: Default to 'unassigned' department
  const handleSubmitIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roNumber.trim() || !techNumber.trim() || !customerLastName.trim()) {
      if (showNotification) showNotification('Please fill out all required fields.', true);
      return;
    }

    setSubmitting(true);
    try {
      const newRoId = doc(collection(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders')).id;
      const docRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', newRoId);

      const ln = customerLastName.trim();
      let crmMatch = selectedCustomer;
      if (!crmMatch && matchCandidates.length === 1) {
        crmMatch = matchCandidates[0];
      }
      if (!crmMatch && matchCandidates.length > 1) {
        showNotification?.('Multiple CRM matches — select a customer below before queueing.', true);
        setSubmitting(false);
        return;
      }

      const payload: DispatchRepairOrder = {
        id: newRoId,
        roNumber: roNumber.trim(),
        techNumber: techNumber.trim(),
        customerLastName: ln,
        department: 'unassigned',
        status: initialStatus,
        isCompleted: quickComplete,
        dateCreated: currentSystemDate,
        lastUpdated: new Date().toISOString(),
        dealershipId: currentDealershipId,
        ...(crmMatch ? enrichDispatchFromCustomer(crmMatch) : { customerName: ln }),
      };

      await setDoc(docRef, payload);

      // Reset form states
      setRoNumber('');
      setTechNumber('');
      setCustomerLastName('');
      setSelectedCustomer(null);
      setInitialStatus('WIP');
      setQuickComplete(false);

      if (showNotification) {
        showNotification(`Ticket RO #${payload.roNumber} successfully queued.`);
      }
    } catch (err: any) {
      console.error('[Dispatch] Intake submission error:', err);
      if (showNotification) showNotification('Failed to create new Dispatch card.', true);
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle card completion (Rule B triggers immediate removal from active arrays)
  const handleToggleComplete = async (ro: DispatchRepairOrder, completed: boolean) => {
    try {
      const docRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', ro.id);
      await updateDoc(docRef, {
        isCompleted: completed,
        lastUpdated: new Date().toISOString()
      });
      if (showNotification) {
        showNotification(completed ? `RO #${ro.roNumber} marked as completed.` : `RO #${ro.roNumber} restored back to active board.`);
      }
    } catch (err: any) {
      console.error('[Dispatch] Mutating completion error:', err);
      if (showNotification) showNotification('Failed to update ticket status.', true);
    }
  };

  // Quick Action: Toggling Status directly from the card
  const handleUpdateStatus = async (roId: string, newStatus: 'WIP' | 'DIS' | 'POO' | 'WFA') => {
    try {
      const docRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', roId);
      await updateDoc(docRef, {
        status: newStatus,
        lastUpdated: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Dispatch] Status update error:', err);
    }
  };

  // Remove card entirely
  const handleDeleteCard = async (ro: DispatchRepairOrder) => {
    try {
      const docRef = doc(db, 'artifacts/hyundai-sales-to-service/public/data/dispatchOrders', ro.id);
      await deleteDoc(docRef);
      if (showNotification) showNotification(`RO #${ro.roNumber} removed.`);
    } catch (err: any) {
      console.error('[Dispatch] Delete error:', err);
    }
  };

  // Split Active and Completed tickets
  const activeTickets = useMemo(() => {
    return orders.filter(o => !o.isCompleted);
  }, [orders]);

  const completedTickets = useMemo(() => {
    return orders.filter(o => o.isCompleted);
  }, [orders]);

  // Group active tickets by Department column to build layout fast
  const ticketsByColumn = useMemo(() => {
    const acc: Record<DepartmentColumnId, DispatchRepairOrder[]> = {
      lube: [],
      quick_service: [],
      ac_electrical: [],
      heavyline: [],
      diesel: [],
      trans: [],
      mobile_repair: [],
      unassigned: [] // Queue tray
    };
    
    activeTickets.forEach((t) => {
      if (acc[t.department]) {
        acc[t.department].push(t);
      } else {
        acc.unassigned.push(t);
      }
    });
    return acc;
  }, [activeTickets]);


  const renderDisplayCard = (ro: DispatchRepairOrder) => {
    const statusInfo = DISPATCH_STATUS_COLORS[ro.status] || DISPATCH_STATUS_COLORS.WIP;
    const isOvernight = ro.dateCreated < currentSystemDate;

    return (
      <div
        key={ro.id}
        draggable
        onDragStart={(e) => handleDragStart(e, ro.id)}
        onDragEnd={handleDragEnd}
        style={{ borderLeftColor: statusInfo.hex, borderLeftWidth: '4px' }}
        className={cn(
          'bg-slate-900/90 border border-slate-800 rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing select-none space-y-0.5',
          draggedRoId === ro.id && 'opacity-40 scale-95',
          isOvernight && 'ring-1 ring-amber-500/40'
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-black text-white tabular-nums truncate">RO {ro.roNumber}</span>
          <span
            className="text-[8px] font-black uppercase px-1 py-0.5 rounded shrink-0"
            style={{ backgroundColor: statusInfo.hex, color: statusInfo.text }}
          >
            {ro.status}
          </span>
        </div>
        <p className="text-[9px] font-bold text-slate-300 truncate uppercase">
          {ro.customerName || ro.model || 'Guest'}
        </p>
        <div className="flex items-center justify-between text-[8px] font-mono text-slate-500">
          <span>T#{ro.techNumber}</span>
          <span>…{ro.vinLastEight}</span>
        </div>
      </div>
    );
  };

  const renderRoCard = (ro: DispatchRepairOrder) => {
    const statusInfo = DISPATCH_STATUS_COLORS[ro.status] || DISPATCH_STATUS_COLORS.WIP;
    const isOvernight = ro.dateCreated < currentSystemDate;

    // Check if it's an internal dealership vehicle
    const isInternalAsset = 
      ro.accountName?.toLowerCase().includes("hyundai of santa maria") || 
      !!ro.isInternal || 
      ro.customerName?.toLowerCase().includes("hyundai of santa maria");

    return (
      <div
        key={ro.id}
        draggable
        onDragStart={(e) => handleDragStart(e, ro.id)}
        onDragEnd={handleDragEnd}
        style={{ borderLeftColor: statusInfo.hex, borderLeftWidth: '5px' }}
        className={cn(
          "bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 hover:border-slate-700/80 active:cursor-grabbing p-4 rounded-xl space-y-4 shadow-lg hover:shadow-2xl hover:shadow-indigo-950/10 transition-all duration-300 relative group cursor-grab select-none w-full text-slate-100",
          draggedRoId === ro.id && "opacity-30 scale-95 border-dashed border-indigo-500",
          isOvernight && "ring-1 ring-amber-500/30"
        )}
      >
        {/* 1. HEADER SECTION (DYNAMIC HIERARCHY) */}
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            {isInternalAsset ? (
              /* Internal Asset Top View */
              <>
                <span className="bg-amber-950/80 text-amber-400 border border-amber-900/50 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md block w-fit mb-1">
                  Store Inventory / Recon
                </span>
                <h3 className="text-sm font-semibold tracking-tight text-white truncate">
                  {ro.year || ''} {ro.model || 'Internal Vehicle'}
                </h3>
              </>
            ) : (
              /* Retail Customer Top View */
              <>
                <h3 className="text-sm font-bold tracking-tight text-white uppercase truncate">
                  {ro.customerName || `Retail Guest`}
                </h3>
                {ro.model && (
                  <p className="text-xs text-slate-400 truncate">{ro.year || ''} {ro.model}</p>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <GripVertical size={13} className="text-slate-650 group-hover:text-slate-400 transition-colors cursor-grab" />
            
            {isOvernight && (
              <span className="bg-amber-950/80 text-amber-400 border border-amber-900/40 px-1 py-0.5 rounded text-[8px] font-black uppercase tracking-wider">
                Overnight
              </span>
            )}

            {confirmDeleteId === ro.id ? (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleDeleteCard(ro);
                    setConfirmDeleteId(null);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  className="text-[9px] font-black uppercase text-rose-400 bg-rose-950/80 border border-rose-900/40 px-1 py-0.5 rounded hover:bg-rose-900/80 transition-all cursor-pointer relative z-20 animate-pulse"
                >
                  Delete?
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setConfirmDeleteId(null);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  className="text-[9px] font-black uppercase text-slate-400 bg-slate-950 border border-slate-805 px-1 py-0.5 rounded hover:bg-slate-800 transition-all cursor-pointer relative z-20"
                >
                  No
                </button>
              </div>
            ) : (
              <button 
                type="button" 
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setConfirmDeleteId(ro.id);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation(); // Avoid triggering any drag initiates
                }}
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                className="text-slate-600 hover:text-rose-450 p-0.5 rounded transition-all duration-200 cursor-pointer relative z-20"
                title="Delete from Board"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* 2. CONTACT METADATA SECTION (ONLY RENDER FOR RETAIL GUESTS) */}
        {!isInternalAsset && (ro.phoneNumber || ro.customerName) && (
          <div className="text-xs text-slate-400 flex items-center gap-1.5 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
            <span className="text-slate-500">📞</span>
            <span>{ro.phoneNumber || 'No Phone Entry'}</span>
          </div>
        )}

        {/* 3. CORE TECHNICAL METADATA (VEHICLE SPECIFICS) */}
        <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
          <div className="bg-slate-950/30 p-2 rounded border border-slate-800/40">
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-bold">Identifiers</span>
            <span className="font-mono text-slate-200 block mt-0.5 truncate">
              {isInternalAsset ? `STOCK: ${ro.stockNumber || 'N/A'}` : `TAG: ${ro.tagNumber || 'N/A'}`}
            </span>
            <span className="font-mono text-slate-400 text-[10px] block">
              {ro.vinLastEight ? `VIN …${ro.vinLastEight}` : `Last: ${displayCustomerLastName(ro)}`}
            </span>
          </div>

          <div className="bg-slate-950/30 p-2 rounded border border-slate-800/40">
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-bold">Assigned Tech</span>
            <span className="text-slate-200 font-medium block mt-0.5 truncate">
              Tech #{ro.techNumber}
            </span>
            <span className="text-slate-400 text-[10px] block truncate">
              Dept: {DEPARTMENTS.find(d => d.id === ro.department)?.label || 'Unassigned'}
            </span>
          </div>
        </div>

        {/* 4. ACTIONS & STATUS SELECT */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
          <div className="relative inline-flex items-center w-[125px] sm:w-[135px]">
            <select
              value={ro.status}
              onChange={(e) => handleUpdateStatus(ro.id, e.target.value as any)}
              className="text-[10px] font-black uppercase tracking-wider w-full px-2 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 outline-none cursor-pointer focus:border-indigo-500 transition-all appearance-none text-left"
              style={{ borderLeftColor: statusInfo.hex, borderLeftWidth: '3px' }}
            >
              {Object.entries(DISPATCH_STATUS_COLORS).map(([val, info]) => (
                <option 
                  key={val} 
                  value={val} 
                  className="font-bold text-xs bg-slate-950 text-white py-1"
                >
                  {info.label} ({val})
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-slate-500">
              <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleToggleComplete(ro, true)}
            className="flex items-center gap-1 bg-slate-950 hover:bg-emerald-950/60 hover:text-emerald-400 border border-slate-800 hover:border-emerald-900/60 px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all duration-300 select-none cursor-pointer"
          >
            <Check size={11} className="text-emerald-500" />
            <span>Done</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-slate-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.25em] block">Automated Dispatch System</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase">Departmental Dispatch Board</h1>
          <p className="text-slate-400 text-xs font-medium">
            Streamlining shop capacity by routing tickets structurally across production department bays.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {showTodayLoad && (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-[10px] font-black uppercase tracking-wider">
              <Calendar size={13} className="text-indigo-400 shrink-0" />
              <span className="text-slate-400">Today</span>
              <span className="text-white tabular-nums">{activeTickets.filter((o) => o.dateCreated === currentSystemDate).length}</span>
              <span className="text-slate-600">active ROs</span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400 tabular-nums">{todayApptCount}</span>
              <span className="text-slate-500">appts logged</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">goal {apptGoal}</span>
            </div>
          )}
          <button
            type="button"
            onClick={openDisplayMode}
            disabled={loading || showCompleted}
            className="btn-secondary border text-xs gap-1.5 font-bold uppercase tracking-wider py-2 px-4 rounded-xl transition-all bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-indigo-500/40 disabled:opacity-40"
          >
            <Monitor size={13} />
            <span>Display Preview</span>
          </button>
          
          <button 
            onClick={() => setShowCompleted(!showCompleted)}
            className={cn(
              "btn-secondary border text-xs gap-1.5 font-bold uppercase tracking-wider py-2 px-4 rounded-xl transition-all",
              showCompleted 
                ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/30" 
                : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white"
            )}
          >
            <CheckSquare size={13} />
            <span>{showCompleted ? "View Active Board" : `View Completed Logs (${completedTickets.length})`}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="animate-spin text-indigo-500" size={32} />
          <p className="text-slate-500 text-xs font-black uppercase tracking-wider">Synchronizing Department Lanes...</p>
        </div>
      ) : showCompleted ? (
        /* Completed Tickets Log view */
        <div className="bg-slate-900 border border-slate-850 p-6 rounded-2xl space-y-4">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle2 className="text-emerald-500" size={16} />
            Completed Dispatch History
          </h2>
          {completedTickets.length === 0 ? (
            <p className="text-slate-500 text-xs font-mono py-6 text-center border border-dashed border-slate-850 rounded-xl">
              No completed repair orders logged yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-400">
                <thead>
                  <tr className="border-b border-slate-810 text-[9.5px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="py-2.5 px-3">RO #</th>
                    <th className="py-2.5 px-3">Tech #</th>
                    <th className="py-2.5 px-3">Last Name</th>
                    <th className="py-2.5 px-3">Routed Dept</th>
                    <th className="py-2.5 px-3">Date Completed</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {completedTickets.map(ro => {
                    const deptLabel = DEPARTMENTS.find(d => d.id === ro.department)?.label || 'Unassigned';
                    return (
                      <tr key={ro.id} className="hover:bg-slate-850/30 transition-colors">
                        <td className="py-3 px-3 font-bold text-slate-200">RO {ro.roNumber}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-300">{ro.techNumber}</td>
                        <td className="py-3 px-3 font-bold text-slate-300 uppercase">{displayCustomerLastName(ro)}</td>
                        <td className="py-3 px-3">
                          <span className="bg-slate-950 text-slate-400 px-2 py-1 rounded-md text-[10px] font-bold uppercase border border-slate-800">
                            {deptLabel}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-500 font-mono">{new Date(ro.lastUpdated).toLocaleDateString()}</td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleToggleComplete(ro, false)}
                            className="bg-indigo-950 text-indigo-400 hover:bg-indigo-900 border border-indigo-900/40 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                          >
                            Restore Card
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Horizontal top intake + scrollable list and vertical stack of department rows */
        <div className="space-y-6 w-full pb-10">
          
          {/* TOP CONTAINER — Intake & Waiting Queue */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 w-full items-stretch">

            {/* Fast Intake */}
            <div className="lg:col-span-5 relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-slate-900/90 via-slate-950 to-indigo-950/30 shadow-xl shadow-black/20">
              <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
              <div className="relative p-5 sm:p-6 flex flex-col gap-5">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-400/20 shrink-0">
                    <Plus size={16} className="text-indigo-300" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Fast Intake</h2>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-relaxed">
                      Queue a repair order — match by last name to pull CRM details.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmitIntake} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5">RO Number</label>
                      <input
                        type="text"
                        placeholder="883719"
                        value={roNumber}
                        onChange={(e) => setRoNumber(e.target.value)}
                        className="w-full bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-700 transition-all font-semibold tabular-nums focus:ring-2 focus:ring-indigo-500/15"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5">Tech ID</label>
                      <input
                        type="text"
                        placeholder="402"
                        value={techNumber}
                        onChange={(e) => setTechNumber(e.target.value)}
                        className="w-full bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-700 transition-all font-mono font-bold tabular-nums focus:ring-2 focus:ring-indigo-500/15"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5 flex items-center gap-1.5">
                      <UserSearch size={10} className="text-indigo-400/80" />
                      Customer Last Name
                    </label>
                    <input
                      type="text"
                      placeholder="Martinez"
                      value={customerLastName}
                      onChange={(e) => {
                        setCustomerLastName(e.target.value);
                        setSelectedCustomer(null);
                      }}
                      className="w-full bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-700 transition-all font-semibold uppercase focus:ring-2 focus:ring-indigo-500/15"
                      required
                    />

                    {selectedCustomer && (
                      <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-500/25">
                        <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                        <p className="text-[10px] font-bold text-emerald-200/90 truncate">
                          CRM linked · {selectedCustomer.firstName} {selectedCustomer.lastName}
                          {selectedCustomer.model ? ` · ${selectedCustomer.year || ''} ${selectedCustomer.model}` : ''}
                        </p>
                      </div>
                    )}

                    {customerLastName.trim().length >= 2 && matchCandidates.length > 0 && !selectedCustomer && (
                      <div className="mt-2 rounded-xl border border-slate-800/80 bg-slate-950/50 overflow-hidden">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-600 px-3 py-1.5 border-b border-slate-800/60">
                          CRM matches
                        </p>
                        <div className="max-h-32 overflow-y-auto p-1.5 space-y-1">
                          {matchCandidates.slice(0, 6).map((cust) => (
                            <button
                              key={cust.id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomer(cust);
                                setCustomerLastName(cust.lastName);
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg text-[10px] border border-transparent bg-slate-900/60 text-slate-300 hover:bg-indigo-950/40 hover:border-indigo-500/30 transition-all"
                            >
                              <span className="font-bold text-white">{cust.firstName} {cust.lastName}</span>
                              <span className="text-slate-500 block mt-0.5 font-mono text-[9px]">
                                {[cust.vinLast8 && `VIN …${cust.vinLast8}`, cust.model && `${cust.year || ''} ${cust.model}`.trim()].filter(Boolean).join(' · ')}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {customerLastName.trim().length >= 2 && matchCandidates.length === 0 && (
                      <p className="text-[9px] text-amber-400/80 mt-1.5 pl-0.5 font-medium">No CRM match — ticket will use last name only.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block pl-0.5">Initial Status</label>
                    <div className="relative">
                      <span
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none"
                        style={{ backgroundColor: DISPATCH_STATUS_COLORS[initialStatus].hex }}
                      />
                      <select
                        value={initialStatus}
                        onChange={(e) => setInitialStatus(e.target.value as typeof initialStatus)}
                        className="w-full appearance-none bg-slate-950/70 border border-slate-800/80 focus:border-indigo-400/50 outline-none rounded-lg pl-7 pr-8 py-2.5 text-[11px] text-slate-200 font-bold uppercase tracking-wide cursor-pointer focus:ring-2 focus:ring-indigo-500/15"
                      >
                        {Object.entries(DISPATCH_STATUS_COLORS).map(([val, info]) => (
                          <option key={val} value={val} className="bg-slate-950 text-white">
                            {info.label} ({val})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        id="quickComplete"
                        checked={quickComplete}
                        onChange={(e) => setQuickComplete(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500/30 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-500 group-hover:text-slate-300 font-semibold transition-colors">
                        Mark completed on intake
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 shadow-lg shadow-indigo-950/40 transition-all duration-200"
                    >
                      {submitting ? <RefreshCw className="animate-spin" size={14} /> : <Plus size={14} />}
                      Queue Ticket
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Waiting Queue */}
            <div
              onDragOver={(e) => handleDragOver(e, 'unassigned')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'unassigned')}
              className={cn(
                'lg:col-span-7 relative overflow-hidden rounded-2xl border flex flex-col min-h-[280px] transition-all duration-300 shadow-xl shadow-black/20',
                overColumnId === 'unassigned'
                  ? 'border-indigo-400/40 bg-indigo-950/20 ring-2 ring-indigo-500/20'
                  : 'border-white/[0.08] bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-900/80'
              )}
            >
              <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-violet-500/5 blur-3xl" />
              <div className="relative p-5 sm:p-6 flex flex-col flex-1 gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      'p-2.5 rounded-xl border shrink-0',
                      ticketsByColumn.unassigned.length > 0
                        ? 'bg-amber-500/10 border-amber-400/25'
                        : 'bg-slate-800/50 border-slate-700/50'
                    )}>
                      <Inbox size={16} className={ticketsByColumn.unassigned.length > 0 ? 'text-amber-300' : 'text-slate-500'} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[11px] font-black text-white uppercase tracking-[0.2em] truncate">Waiting Queue</h2>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">Drop cards here or drag out to a department lane</p>
                    </div>
                  </div>
                  <div className={cn(
                    'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black tabular-nums',
                    ticketsByColumn.unassigned.length > 0
                      ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                      : 'bg-slate-950/80 border-slate-800 text-slate-500'
                  )}>
                    <span className="text-[8px] uppercase tracking-widest opacity-70">Queue</span>
                    <span className="text-sm leading-none">{ticketsByColumn.unassigned.length}</span>
                  </div>
                </div>

                <div className={cn(
                  'flex-1 flex gap-3 overflow-x-auto py-2 px-2 items-stretch min-h-[160px] rounded-xl transition-colors',
                  ticketsByColumn.unassigned.length === 0
                    ? 'border border-dashed border-slate-800/80 bg-slate-950/30'
                    : 'border border-slate-800/60 bg-slate-950/40'
                )}>
                  {ticketsByColumn.unassigned.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8 px-4 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                        <CheckCircle2 size={22} className="text-emerald-500/70" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Queue is clear</p>
                        <p className="text-[10px] text-slate-600 mt-1 max-w-[220px]">All tickets are routed to production lanes.</p>
                      </div>
                    </div>
                  ) : (
                    ticketsByColumn.unassigned.map((ro) => (
                      <div key={ro.id} className="w-[260px] sm:w-[280px] shrink-0 py-1">
                        {renderRoCard(ro)}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* LOWER CANVAS: 7 Main Structural Production Departments as Rows */}
          <div className="flex flex-col gap-4 w-full">
            {DEPARTMENTS.map((dept) => {
              const list = ticketsByColumn[dept.id] || [];
              const isOver = overColumnId === dept.id;

              return (
                <div 
                  key={dept.id} 
                  onDragOver={(e) => handleDragOver(e, dept.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, dept.id)}
                  className={cn(
                    "bg-gradient-to-r from-slate-900/60 to-slate-900/30 border border-slate-850 rounded-2xl p-4.5 flex flex-col md:flex-row md:items-center gap-5 w-full transition-all duration-300 shadow-md relative",
                    isOver && "from-slate-850/80 to-slate-900/80 border-dashed border-indigo-500/60 scale-[1.002] shadow-lg shadow-indigo-950/25",
                    list.length > 0 ? "border-slate-800/80 bg-slate-900/40" : "border-slate-900/60"
                  )}
                >
                  {/* Department Title, Icon, and Ticket Count */}
                  <div className="flex items-center justify-between md:flex-col md:items-start md:justify-center gap-1.5 md:w-48 shrink-0 border-b md:border-b-0 md:border-r border-slate-800/80 pb-3 md:pb-0 md:pr-4 select-none">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-slate-950 border border-slate-800/85 rounded-lg text-indigo-400">
                        <dept.icon size={13} />
                      </div>
                      <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest font-sans">
                        {dept.label}
                      </h3>
                    </div>
                    {(() => {
                      const cap = laneCapacity[dept.id];
                      const atCap = cap > 0 && list.length >= cap;
                      return (
                        <span className={cn(
                          'border px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider tabular-nums',
                          atCap ? 'bg-rose-950/50 text-rose-400 border-rose-900/50' : 'bg-slate-950 text-slate-400 border-slate-800'
                        )}>
                          {cap > 0 ? `${list.length}/${cap}` : list.length} {list.length === 1 ? 'ticket' : 'tickets'}
                          {atCap ? ' · FULL' : ''}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Horizontal Scroll Area for active cards */}
                  <div className="flex-1 flex gap-4 overflow-x-auto pb-2 min-h-[150px] items-center scrollbar-thin">
                    {list.length === 0 ? (
                      <div className="flex items-center gap-2 text-slate-600 py-6 px-3 border border-dashed border-slate-950/60 rounded-xl w-full">
                        <HelpCircle size={14} className="text-slate-700" />
                        <p className="text-[10px] font-black uppercase tracking-wider">Vacant Lane — drag an RO card here to schedule</p>
                      </div>
                    ) : (
                      list.map((ro) => (
                        <div key={ro.id} className="w-[285px] shrink-0">
                          {renderRoCard(ro)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* QUICK LEGEND & COLOR CODE */}
          <div className="bg-slate-900 border border-slate-850 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 select-none">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status Color Codes:</span>
            <div className="flex flex-wrap gap-4 text-[10px] font-bold">
              {Object.entries(DISPATCH_STATUS_COLORS).map(([code, info]) => (
                <div key={code} className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-850">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: info.hex }}></span>
                  <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">{info.label} ({code})</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {isDisplayMode && (
        <div
          className="fixed inset-0 z-[9999] bg-slate-950 text-slate-100 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Dispatch display preview"
        >
          <div className="relative w-full h-full max-w-[1920px] max-h-[1080px] flex flex-col p-2 box-border">
            <button
              type="button"
              onClick={closeDisplayMode}
              className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700 text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-white hover:border-slate-500 opacity-40 hover:opacity-100 transition-opacity"
              title="Exit display preview (Esc)"
            >
              <X size={12} />
              Exit
            </button>

            <div className="grid grid-cols-8 gap-1.5 flex-1 min-h-0 w-full h-full">
              {DISPLAY_COLUMNS.map((col) => {
                const list = ticketsByColumn[col.id] || [];
                const cap = col.id === 'unassigned' ? 0 : laneCapacity[col.id];
                const atCap = cap > 0 && list.length >= cap;
                const isOver = overColumnId === col.id;

                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => handleDragOver(e, col.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, col.id)}
                    className={cn(
                      'flex flex-col min-w-0 min-h-0 rounded-xl border bg-slate-900/60 overflow-hidden',
                      isOver ? 'border-indigo-500/70 bg-slate-800/80' : 'border-slate-800/80'
                    )}
                  >
                    <div className="shrink-0 px-2 py-1.5 border-b border-slate-800/80 bg-slate-950/80 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <col.icon size={11} className="text-indigo-400 shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-wide truncate leading-tight">
                          {col.shortLabel}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'text-[8px] font-black tabular-nums px-1.5 py-0.5 rounded shrink-0',
                          atCap ? 'bg-rose-950 text-rose-400' : 'bg-slate-800 text-slate-400'
                        )}
                      >
                        {cap > 0 ? `${list.length}/${cap}` : list.length}
                      </span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1.5 space-y-1.5">
                      {list.length === 0 ? (
                        <p className="text-[8px] font-bold uppercase tracking-wider text-slate-600 text-center py-4 px-1">
                          —
                        </p>
                      ) : (
                        list.map((ro) => renderDisplayCard(ro))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

