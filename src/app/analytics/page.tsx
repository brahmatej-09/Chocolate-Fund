'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface ReportRow {
  date?: string;
  week?: string;
  month?: string;
  total_amount: string;
  transaction_count: string;
}

type ReportType = 'daily' | 'weekly' | 'monthly';

export default function Analytics() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ReportType>('daily');
  const [report, setReport] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchReport(activeTab);
  }, [activeTab, router]);

  const fetchReport = async (type: ReportType) => {
    setLoading(true);
    try {
      const res = await api.get(`/transactions/report/${type}`);
      setReport(res.data);
    } catch (error) {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const getLabel = (row: ReportRow) => {
    if (row.date) return new Date(row.date).toLocaleDateString();
    if (row.week) return `Week of ${new Date(row.week).toLocaleDateString()}`;
    if (row.month) return new Date(row.month).toLocaleString('default', { month: 'long', year: 'numeric' });
    return '—';
  };

  const totalCollected = report.reduce((sum, r) => sum + parseFloat(r.total_amount || '0'), 0);
  const totalTransactions = report.reduce((sum, r) => sum + parseInt(r.transaction_count || '0'), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Analytics & Reports</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <p className="text-sm text-muted-foreground mb-1">Total Collected ({activeTab})</p>
          <p className="text-3xl font-bold text-primary">₹{totalCollected.toFixed(2)}</p>
        </div>
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <p className="text-sm text-muted-foreground mb-1">Total Transactions ({activeTab})</p>
          <p className="text-3xl font-bold text-green-600">{totalTransactions}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex border-b border-border">
          {(['daily', 'weekly', 'monthly'] as ReportType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${activeTab === tab
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : report.length === 0 ? (
            <p className="text-center text-muted-foreground/60 py-8">No transactions found for this period.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Period</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Collected</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Transactions</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg per Transaction</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {report.map((row, i) => (
                  <tr key={i} className="hover:bg-accent/30">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">{getLabel(row)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-primary">₹{parseFloat(row.total_amount).toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{row.transaction_count}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      ₹{(parseFloat(row.total_amount) / parseInt(row.transaction_count)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
