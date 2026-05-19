import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';
import clsx from 'clsx';
import { format } from 'date-fns';

export default function EstimatesTab({ selectedJobId }: { selectedJobId: string | null }) {
  const queryClient = useQueryClient();

  const { data: jobInfo } = useQuery({
    queryKey: ['job', selectedJobId],
    queryFn: async () => {
      const res = await api.get(`/jobs/${selectedJobId}`);
      return res.data;
    },
    enabled: !!selectedJobId,
  });

  const { data: estimate, isLoading } = useQuery({
    queryKey: ['estimate', selectedJobId],
    queryFn: async () => {
      const res = await api.get(`/jobs/${selectedJobId}/estimate`);
      return res.data;
    },
    enabled: !!selectedJobId,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await api.patch(`/jobs/${selectedJobId}/estimate`, updates);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', selectedJobId] });
      queryClient.invalidateQueries({ queryKey: ['job', selectedJobId] });
    }
  });

  const actionMutation = useMutation({
    mutationFn: async ({ action, payload }: { action: string, payload?: any }) => {
      const res = await api.post(`/jobs/${selectedJobId}/estimate/${action}`, payload || {});
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', selectedJobId] });
      queryClient.invalidateQueries({ queryKey: ['job', selectedJobId] });
    }
  });

  // Local state for live recalculation
  const [markupPct, setMarkupPct] = useState(0);
  const [taxRatePct, setTaxRatePct] = useState(10);
  const [discountPct, setDiscountPct] = useState(0);

  useEffect(() => {
    if (estimate) {
      setMarkupPct(parseFloat(estimate.markup_pct) || 0);
      setTaxRatePct(parseFloat(estimate.tax_rate_pct) || 0);
      setDiscountPct(parseFloat(estimate.discount_pct) || 0);
    }
  }, [estimate]);

  if (!selectedJobId) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 bg-white border border-slate-200 border-dashed rounded">
        Select a job to view its estimate.
      </div>
    );
  }

  if (isLoading || !estimate) return <div className="p-6">Loading estimate...</div>;

  const isLocked = estimate.status === 'approved';

  // Live calculation
  const subtotal = estimate.line_items.reduce((acc: number, item: any) => acc + (item.qty * item.unit_rate), 0);
  const markupAmount = subtotal * (markupPct / 100);
  const afterMarkup = subtotal + markupAmount;
  const discountAmount = afterMarkup * (discountPct / 100);
  const afterDiscount = afterMarkup - discountAmount;
  
  let taxableAmount = 0;
  estimate.line_items.forEach((item: any) => {
    if (item.taxable) {
      const lineSub = item.qty * item.unit_rate;
      const lineMarkup = lineSub * (markupPct / 100);
      const lineAfterMarkup = lineSub + lineMarkup;
      const lineDiscount = lineAfterMarkup * (discountPct / 100);
      taxableAmount += (lineAfterMarkup - lineDiscount);
    }
  });

  const taxAmount = taxableAmount * (taxRatePct / 100);
  const total = afterDiscount + taxAmount;

  const handleBlur = (field: string, value: number) => {
    if (isLocked) return;
    updateMutation.mutate({ [field]: value });
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-slate-200 text-slate-800',
    sent: 'bg-blue-100 text-blue-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800 line-through',
  };

  return (
    <div className="w-full max-w-5xl h-full flex gap-6">
      
      {/* Left Column: Line Items */}
      <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <div>
            <h2 className="font-bold text-lg">Estimate Line Items</h2>
            {jobInfo && <p className="text-xs text-slate-500">For: <span className="font-semibold text-slate-700">{jobInfo.title}</span></p>}
          </div>
          <div className="flex items-center gap-2">
            <span className={clsx("px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide", statusColors[estimate.status])}>
              {estimate.status}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="pb-2 font-semibold">Item</th>
                <th className="pb-2 font-semibold text-right w-20">Qty</th>
                <th className="pb-2 font-semibold text-right w-24">Rate</th>
                <th className="pb-2 font-semibold text-right w-24">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {estimate.line_items.map((item: any) => (
                <tr key={item.task_id}>
                  <td className="py-3">
                    <div className="font-medium text-slate-800">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.type} {item.taxable ? '• Taxable' : ''}</div>
                  </td>
                  <td className="py-3 text-right font-mono text-slate-600">{item.qty}</td>
                  <td className="py-3 text-right font-mono text-slate-600">${Number(item.unit_rate).toFixed(2)}</td>
                  <td className="py-3 text-right font-mono font-semibold text-slate-800">${Number(item.subtotal).toFixed(2)}</td>
                </tr>
              ))}
              {estimate.line_items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">No tasks found. Add tasks to build estimate.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-8">
            <label className="block text-xs font-semibold text-slate-600 mb-2">Estimate Notes</label>
            <textarea
              disabled={isLocked}
              defaultValue={estimate.note || ''}
              onBlur={(e) => handleBlur('note', e.target.value as any)}
              className="w-full border border-slate-300 rounded p-3 text-sm h-32 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="Notes to appear on the estimate..."
            />
          </div>
        </div>
      </div>

      {/* Right Column: Totals & Controls */}
      <div className="w-80 shrink-0 flex flex-col gap-4">
        
        <div className="bg-white border border-slate-200 rounded shadow-sm p-5">
          <h3 className="font-bold text-lg mb-4 border-b pb-2">Totals</h3>
          
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-mono">${subtotal.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Markup %</span>
                <input 
                  type="number" 
                  min="0"
                  disabled={isLocked}
                  value={markupPct} 
                  onChange={e => setMarkupPct(parseFloat(e.target.value) || 0)}
                  onBlur={e => handleBlur('markup_pct', parseFloat(e.target.value) || 0)}
                  className="w-16 border rounded px-2 py-1 text-right font-mono disabled:bg-slate-50" 
                />
              </div>
              <span className="font-mono">+${markupAmount.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Discount %</span>
                <input 
                  type="number" 
                  min="0"
                  disabled={isLocked}
                  value={discountPct} 
                  onChange={e => setDiscountPct(parseFloat(e.target.value) || 0)}
                  onBlur={e => handleBlur('discount_pct', parseFloat(e.target.value) || 0)}
                  className="w-16 border rounded px-2 py-1 text-right font-mono disabled:bg-slate-50" 
                />
              </div>
              <span className="font-mono text-green-600">-${discountAmount.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Tax Rate %</span>
                <input 
                  type="number" 
                  min="0"
                  disabled={isLocked}
                  value={taxRatePct} 
                  onChange={e => setTaxRatePct(parseFloat(e.target.value) || 0)}
                  onBlur={e => handleBlur('tax_rate_pct', parseFloat(e.target.value) || 0)}
                  className="w-16 border rounded px-2 py-1 text-right font-mono disabled:bg-slate-50" 
                />
              </div>
              <span className="font-mono">+${taxAmount.toFixed(2)}</span>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-between items-center font-bold text-lg">
              <span>Total</span>
              <span className="font-mono">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded shadow-sm p-5">
          <h3 className="font-bold text-md mb-4 border-b pb-2">Actions</h3>
          
          <div className="space-y-3">
            {isLocked ? (
              <div className="bg-slate-50 border border-slate-200 rounded p-3 text-center">
                <p className="text-sm font-semibold text-slate-700 mb-1">Estimate Locked</p>
                <p className="text-xs text-slate-500 mb-3">Approved on {estimate.approved_at && format(new Date(estimate.approved_at), 'MMM d, yyyy')}</p>
                <button 
                  onClick={() => {
                     // Normally would have a workflow to request revision, we can just reject to unlock for testing
                     if(confirm('Unlock by rejecting?')) actionMutation.mutate({ action: 'reject' })
                  }}
                  className="w-full border border-slate-300 bg-white text-slate-700 py-2 rounded text-sm font-semibold hover:bg-slate-50"
                >
                  Request Revision
                </button>
              </div>
            ) : (
              <>
                <button 
                  onClick={() => actionMutation.mutate({ action: 'send' })}
                  disabled={estimate.status === 'sent'}
                  className="w-full bg-blue-600 text-white py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {estimate.status === 'sent' ? 'Sent' : 'Mark as Sent'}
                </button>
                <button 
                  onClick={() => {
                    const by = prompt('Approver name:');
                    if (by) actionMutation.mutate({ action: 'approve', payload: { approved_by: by } });
                  }}
                  className="w-full bg-green-600 text-white py-2 rounded text-sm font-semibold hover:bg-green-700"
                >
                  Approve Estimate
                </button>
                <button 
                  onClick={() => {
                    if(confirm('Reject estimate?')) actionMutation.mutate({ action: 'reject' });
                  }}
                  className="w-full border border-red-200 text-red-600 bg-white py-2 rounded text-sm font-semibold hover:bg-red-50"
                >
                  Reject Estimate
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

