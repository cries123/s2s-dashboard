import React from 'react';
import { Shield } from 'lucide-react';

const ROWS: {
  action: string;
  manager: string;
  admin: string;
  staff: string;
}[] = [
  { action: 'Dealership user administration', manager: 'Yes — own store', admin: 'Master users only', staff: 'No' },
  { action: 'Approve staff enrollments', manager: 'Yes — own store', admin: 'Yes — all stores', staff: 'No' },
  { action: 'Approve manager enrollments', manager: 'Yes — own store', admin: 'Yes — all stores', staff: 'No' },
  { action: 'Daily / monthly goals', manager: 'Yes — own store', admin: 'Yes — all stores', staff: 'No' },
  { action: 'DMS provider & parsers', manager: 'Yes — own store', admin: 'Yes — all stores', staff: 'No' },
  { action: 'Dispatch lane capacity & toggles', manager: 'Yes — own store', admin: 'Yes — all stores', staff: 'No' },
  { action: 'Pot of Gold / competition rosters', manager: 'Yes — own store', admin: 'Yes — all stores', staff: 'No' },
  { action: 'Store workspace defaults', manager: 'Yes — own store', admin: 'Yes — all stores', staff: 'No' },
  { action: 'Send password reset (staff)', manager: 'Yes — own store staff', admin: 'Yes — all stores', staff: 'No' },
  { action: 'Master user email / password override', manager: 'No', admin: 'Yes', staff: 'No' },
  { action: 'Audit logs (all tenants)', manager: 'No', admin: 'Yes', staff: 'No' },
  { action: 'Audit logs (own tenant)', manager: 'Yes', admin: 'Yes', staff: 'No' },
  { action: 'Personal workspace preferences', manager: 'Own profile', admin: 'Own profile', staff: 'Own profile' },
  { action: 'Dispatch board intake & moves', manager: 'Yes', admin: 'Yes', staff: 'Yes — if dispatch enabled' },
];

export function ManagerPermissionsMatrix() {
  return (
    <div className="space-y-3 pt-4 border-t border-white/5">
      <div>
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
          <Shield size={12} className="text-violet-400" />
          Manager permissions matrix
        </label>
        <p className="text-[10px] text-slate-500 mt-1 max-w-2xl">
          Who can change operational settings vs personal preferences. System admin = primary platform admin account.
        </p>
      </div>

      {/* Mobile / tablet — stacked definition-list cards, no horizontal scroll */}
      <div className="md:hidden space-y-2">
        {ROWS.map((row) => (
          <div key={row.action} className="card-base rounded-xl p-3 space-y-2.5">
            <p className="text-xs font-bold text-white">{row.action}</p>
            <div className="grid grid-cols-1 gap-2 text-[11px]">
              <div>
                <p className="crm-label">Manager</p>
                <p className="text-slate-300">{row.manager}</p>
              </div>
              <div>
                <p className="crm-label">System admin</p>
                <p className="text-slate-300">{row.admin}</p>
              </div>
              <div>
                <p className="crm-label">Staff</p>
                <p className="text-slate-300">{row.staff}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop — full reference table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-white/5 bg-slate-950/80">
              <th className="px-3 py-2 font-black uppercase text-slate-500 text-[9px]">Action</th>
              <th className="px-3 py-2 font-black uppercase text-slate-500 text-[9px]">Manager</th>
              <th className="px-3 py-2 font-black uppercase text-slate-500 text-[9px]">System admin</th>
              <th className="px-3 py-2 font-black uppercase text-slate-500 text-[9px]">Staff</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.action} className="border-b border-white/5 last:border-0">
                <td className="px-3 py-2.5 text-slate-300 font-medium">{row.action}</td>
                <td className="px-3 py-2.5 text-slate-400">{row.manager}</td>
                <td className="px-3 py-2.5 text-slate-400">{row.admin}</td>
                <td className="px-3 py-2.5 text-slate-400">{row.staff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ManagerPermissionsMatrix;
