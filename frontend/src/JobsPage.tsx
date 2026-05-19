import { useState } from 'react';
import clsx from 'clsx';
import JobsTab from './JobsTab';
import TasksTab from './TasksTab';
import EstimatesTab from './EstimatesTab';

type Tab = 'jobs' | 'tasks' | 'estimates';

export default function JobsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('jobs');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'jobs', label: 'Jobs' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'estimates', label: 'Estimates' },
  ];

  return (
    <div className="flex flex-col w-full flex-1 bg-slate-100">
      <div className="bg-red-500 text-white p-2 text-center font-bold">FRONTEND RENDERING TEST</div>
      <div className="bg-white border-b border-slate-200 px-6 pt-4 flex gap-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "pb-3 px-1 border-b-2 font-medium transition-colors",
              activeTab === tab.id 
                ? "border-blue-600 text-blue-700" 
                : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      <div className="flex-1 overflow-auto p-6 flex justify-center">
        {activeTab === 'jobs' && (
          <JobsTab 
            selectedJobId={selectedJobId} 
            onSelectJob={(id) => {
              setSelectedJobId(id);
              // Optional: Auto-switch to tasks tab when a job is selected
              // setActiveTab('tasks'); 
            }} 
          />
        )}
        {activeTab === 'tasks' && <TasksTab selectedJobId={selectedJobId} />}
        {activeTab === 'estimates' && <EstimatesTab selectedJobId={selectedJobId} />}
      </div>
    </div>
  );
}
