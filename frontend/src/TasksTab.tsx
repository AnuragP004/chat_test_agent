import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';
import clsx from 'clsx';


export default function TasksTab({ selectedJobId }: { selectedJobId: string | null }) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  
  // New task form state
  const [name, setName] = useState('');
  const [type, setType] = useState('labour');
  const [qty, setQty] = useState('');
  const [unitRate, setUnitRate] = useState('');
  const [taxable, setTaxable] = useState(true);

  const { data: jobInfo } = useQuery({
    queryKey: ['job', selectedJobId],
    queryFn: async () => {
      const res = await api.get(`/jobs/${selectedJobId}`);
      return res.data;
    },
    enabled: !!selectedJobId,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', selectedJobId],
    queryFn: async () => {
      const res = await api.get(`/jobs/${selectedJobId}/tasks`);
      return res.data;
    },
    enabled: !!selectedJobId,
  });

  const addMutation = useMutation({
    mutationFn: async (task: any) => {
      const res = await api.post(`/jobs/${selectedJobId}/tasks`, task);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', selectedJobId] });
      queryClient.invalidateQueries({ queryKey: ['job', selectedJobId] }); // invalidates estimate too
      setIsAdding(false);
      setName('');
      setQty('');
      setUnitRate('');
      setTaxable(true);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string, updates: any }) => {
      const res = await api.patch(`/jobs/${selectedJobId}/tasks/${taskId}`, updates);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', selectedJobId] });
      queryClient.invalidateQueries({ queryKey: ['job', selectedJobId] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await api.delete(`/jobs/${selectedJobId}/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', selectedJobId] });
      queryClient.invalidateQueries({ queryKey: ['job', selectedJobId] });
    }
  });

  if (!selectedJobId) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 bg-white border border-slate-200 border-dashed rounded">
        Select a job to view its tasks.
      </div>
    );
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addMutation.mutate({
      name,
      type,
      qty: parseFloat(qty),
      unit_rate: parseFloat(unitRate),
      taxable,
    });
  };

  return (
    <div className="w-full max-w-5xl flex flex-col h-full bg-white border border-slate-200 rounded shadow-sm">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <div>
          <h2 className="font-bold text-lg">Tasks</h2>
          {jobInfo && <p className="text-xs text-slate-500">Viewing tasks for: <span className="font-semibold text-slate-700">{jobInfo.title}</span></p>}
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-slate-900 text-white px-4 py-2 rounded text-sm hover:bg-slate-800"
        >
          {isAdding ? 'Cancel' : '+ Add Task'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="p-4 border-b border-slate-200 bg-slate-50 grid grid-cols-12 gap-4 items-end">
          <div className="col-span-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} className="w-full border p-2 rounded text-sm" placeholder="Task description" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full border p-2 rounded text-sm">
              <option value="labour">Labour</option>
              <option value="material">Material</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Qty</label>
            <input required type="number" step="0.01" value={qty} onChange={e => setQty(e.target.value)} className="w-full border p-2 rounded text-sm font-mono" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Rate ($)</label>
            <input required type="number" step="0.01" value={unitRate} onChange={e => setUnitRate(e.target.value)} className="w-full border p-2 rounded text-sm font-mono" />
          </div>
          <div className="col-span-1 flex items-center mb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={taxable} onChange={e => setTaxable(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
              <span className="text-xs font-semibold text-slate-600">Tax</span>
            </label>
          </div>
          <div className="col-span-2">
            <button type="submit" disabled={addMutation.isPending} className="w-full bg-blue-600 text-white py-2 rounded font-semibold text-sm hover:bg-blue-700">
              Save Task
            </button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-auto">
        {isLoading ? <div className="p-6 text-slate-500">Loading tasks...</div> : null}
        
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 bg-slate-50 uppercase sticky top-0 border-b border-slate-200 shadow-sm">
            <tr>
              <th className="px-4 py-3">Task Name</th>
              <th className="px-4 py-3 w-20">Type</th>
              <th className="px-4 py-3 w-16 text-right">Qty</th>
              <th className="px-4 py-3 w-20 text-right">Rate</th>
              <th className="px-4 py-3 w-16 text-center">Tax</th>
              <th className="px-4 py-3 w-24 text-right">Subtotal</th>
              <th className="px-4 py-3 w-16 text-center">Act. Hrs</th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.tasks.map((task: any) => (
              <tr key={task.task_id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{task.name}</td>
                <td className="px-4 py-3">
                  <span className={clsx("px-2 py-0.5 rounded text-xs font-medium", task.type === 'labour' ? "bg-purple-100 text-purple-800" : "bg-orange-100 text-orange-800")}>
                    {task.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <input 
                    type="number" 
                    step="0.01" 
                    defaultValue={parseFloat(task.qty)}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val !== parseFloat(task.qty)) {
                        updateMutation.mutate({ taskId: task.task_id, updates: { qty: val } });
                      }
                    }}
                    className="w-full text-right border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent font-mono" 
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <input 
                    type="number" 
                    step="0.01" 
                    defaultValue={parseFloat(task.unit_rate)}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val !== parseFloat(task.unit_rate)) {
                        updateMutation.mutate({ taskId: task.task_id, updates: { unit_rate: val } });
                      }
                    }}
                    className="w-full text-right border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent font-mono" 
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input 
                    type="checkbox" 
                    checked={task.taxable} 
                    onChange={(e) => {
                      updateMutation.mutate({ taskId: task.task_id, updates: { taxable: e.target.checked } });
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-slate-700">
                  ${Number(task.subtotal).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-center">
                  <input 
                    type="number" 
                    step="0.1" 
                    defaultValue={parseFloat(task.actual_hrs) || 0}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val !== parseFloat(task.actual_hrs || 0)) {
                        updateMutation.mutate({ taskId: task.task_id, updates: { actual_hrs: val } });
                      }
                    }}
                    className="w-12 text-center border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent font-mono text-slate-500" 
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button 
                    onClick={() => { if(confirm('Delete task?')) deleteMutation.mutate(task.task_id) }}
                    className="text-red-400 hover:text-red-600 font-medium text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {data?.tasks.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No tasks added yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
