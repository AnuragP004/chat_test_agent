import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';
import clsx from 'clsx';
import { format } from 'date-fns';

export default function JobsTab({ selectedJobId, onSelectJob }: { selectedJobId: string | null, onSelectJob: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCustomer, setNewCustomer] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', { status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const res = await api.get('/jobs', { params });
      return res.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (job: { title: string, customer: string }) => {
      const res = await api.post('/jobs', job);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setIsCreating(false);
      setNewTitle('');
      setNewCustomer('');
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ title: newTitle, customer: newCustomer });
  };

  const statusColors: Record<string, string> = {
    open: 'bg-slate-200 text-slate-800',
    in_progress: 'bg-amber-100 text-amber-800',
    closed: 'bg-green-100 text-green-800',
  };

  const priorityColors: Record<string, string> = {
    low: 'border-l-slate-400',
    normal: 'border-l-blue-500',
    high: 'border-l-red-500',
  };

  return (
    <div className="w-full max-w-5xl flex gap-6 h-full">
      <div className="flex-1 flex flex-col h-full">
        <div className="flex justify-between items-center mb-4 shrink-0">
          <div className="flex gap-2">
            {['all', 'open', 'in_progress', 'closed'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={clsx(
                  "px-3 py-1 rounded text-xs uppercase tracking-wider font-semibold border",
                  statusFilter === s ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                )}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded shadow-sm hover:bg-blue-700 font-medium"
          >
            + New Job
          </button>
        </div>

        {isCreating && (
          <form onSubmit={handleCreate} className="bg-white p-4 rounded border border-slate-200 mb-4 shadow-sm shrink-0">
            <h3 className="font-bold mb-3">Create New Job</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Title</label>
                <input required value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full border p-2 rounded" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Customer</label>
                <input required value={newCustomer} onChange={e => setNewCustomer(e.target.value)} className="w-full border p-2 rounded" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 border rounded hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-slate-900 text-white rounded hover:bg-slate-800">Save</button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-auto bg-white rounded border border-slate-200 divide-y divide-slate-100">
          {isLoading ? <div className="p-4 text-slate-500">Loading jobs...</div> : null}
          {data?.jobs.map((job: any) => (
            <div 
              key={job.job_id}
              onClick={() => onSelectJob(job.job_id)}
              className={clsx(
                "p-4 cursor-pointer hover:bg-slate-50 transition-colors border-l-4",
                selectedJobId === job.job_id ? "bg-blue-50" : "",
                priorityColors[job.priority] || priorityColors.normal
              )}
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-base">{job.title}</h4>
                <span className={clsx("px-2 py-0.5 rounded-full text-xs font-semibold", statusColors[job.status])}>
                  {job.status.replace('_', ' ')}
                </span>
              </div>
              <div className="text-slate-500 text-sm flex justify-between">
                <span>{job.customer}</span>
                <span className="font-mono">${Number(job.estimate_total).toFixed(2)}</span>
              </div>
              <div className="mt-3 flex gap-4 text-xs text-slate-400">
                <span>Tasks: {job.task_count}</span>
                <span>Estimate: <span className="uppercase">{job.estimate_status}</span></span>
                <span>{format(new Date(job.created_at), 'MMM d, yyyy')}</span>
              </div>
            </div>
          ))}
          {data?.jobs.length === 0 && <div className="p-8 text-center text-slate-500">No jobs found.</div>}
        </div>
      </div>
      
      {/* Detail panel placeholder - could be a drawer but we'll show it side-by-side for desktop view */}
      {selectedJobId ? (
        <JobDetailPanel jobId={selectedJobId} />
      ) : (
        <div className="w-80 shrink-0 bg-slate-50 border border-slate-200 border-dashed rounded flex items-center justify-center text-slate-400 p-6 text-center">
          Select a job to view details
        </div>
      )}
    </div>
  );
}

function JobDetailPanel({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const res = await api.get(`/jobs/${jobId}`);
      return res.data;
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await api.patch(`/jobs/${jobId}`, updates);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    }
  });

  if (isLoading) return <div className="w-80 p-6">Loading...</div>;
  if (!job) return <div className="w-80 p-6">Not found</div>;

  return (
    <div className="w-80 shrink-0 bg-white border border-slate-200 rounded p-6 overflow-auto shadow-sm">
      <h3 className="font-bold text-lg mb-4 border-b pb-2">Job Details</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Status</label>
          <select 
            value={job.status} 
            onChange={e => updateMutation.mutate({ status: e.target.value })}
            className="w-full border rounded p-1.5 text-sm"
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        
        <div>
          <label className="block text-xs text-slate-500 mb-1">Priority</label>
          <select 
            value={job.priority} 
            onChange={e => updateMutation.mutate({ priority: e.target.value })}
            className="w-full border rounded p-1.5 text-sm"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Customer</label>
          <div className="text-sm">{job.customer}</div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Notes</label>
          <textarea 
            defaultValue={job.notes || ''}
            onBlur={e => updateMutation.mutate({ notes: e.target.value })}
            className="w-full border rounded p-2 text-sm h-24"
            placeholder="Add notes..."
          />
        </div>
        
        <div className="pt-4 border-t border-slate-100">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-500">Estimate Total</span>
            <span className="font-mono font-bold">${Number(job.estimate?.total || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Tasks</span>
            <span className="font-mono">{job.tasks?.length || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
