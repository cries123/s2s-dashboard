import React from 'react';
import { Users } from 'lucide-react';
import type { StaffRoleTemplateId } from '../../../types';
import { STAFF_ROLE_TEMPLATES } from '../../../lib/roleTemplates';
import { cn } from '../../../lib/utils';

interface StaffRoleTemplatePickerProps {
  value: StaffRoleTemplateId;
  onChange: (id: StaffRoleTemplateId) => void;
  disabled?: boolean;
}

export function StaffRoleTemplatePicker({ value, onChange, disabled }: StaffRoleTemplatePickerProps) {
  return (
    <div className="space-y-2">
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
        <Users size={11} className="text-brand-primary" />
        Role template on approval
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {STAFF_ROLE_TEMPLATES.map((template) => {
          const selected = value === template.id;
          return (
            <button
              key={template.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(template.id)}
              className={cn(
                'text-left rounded-xl border p-3 transition-colors disabled:opacity-50',
                selected
                  ? 'border-brand-primary/50 bg-brand-primary/10'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-600'
              )}
            >
              <p className="text-[10px] font-black uppercase text-slate-900 dark:text-white">{template.label}</p>
              <p className="text-[10px] text-slate-500 mt-1 leading-snug">{template.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default StaffRoleTemplatePicker;
