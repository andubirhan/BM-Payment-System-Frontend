import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts';
import { adminAPI } from '../lib/api';

export default function SystemHealth() {
  const [healthData, setHealthData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHealthData = async () => {
      try {
        const response = await adminAPI.getSystemHealth();
        setHealthData(response.data);
        
        // Add to history for charts
        setHistory(prev => {
          const newEntry = {
            time: new Date(response.data.timestamp).toLocaleTimeString(),
            heapUsed: response.data.jvmMemory.heapUsedMB,
            heapMax: response.data.jvmMemory.heapMaxMB,
            threadCount: response.data.threadCount,
            systemLoad: response.data.systemLoadAverage,
            transactionsLastMinute: response.data.transactionMetrics?.transactionsLastMinute || 0,
            transactionsLastHour: response.data.transactionMetrics?.transactionsLastHour || 0
          };
          const updated = [...prev, newEntry];
          // Keep last 20 data points
          return updated.slice(-20);
        });
        
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch system health data');
        setLoading(false);
      }
    };

    fetchHealthData();
    const interval = setInterval(fetchHealthData, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">System Health Monitor</h1>
        <div className="text-gray-600">Loading system health data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">System Health Monitor</h1>
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  const heapUsagePercent = healthData.jvmMemory.getHeapUsagePercentage?.() || 
    (healthData.jvmMemory.heapUsedMB / healthData.jvmMemory.heapMaxMB * 100);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">System Health Monitor</h1>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Heap Memory Usage</h3>
          <p className="text-2xl font-bold text-blue-600">
            {heapUsagePercent.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-400">
            {healthData.jvmMemory.heapUsedMB.toFixed(0)} / {healthData.jvmMemory.heapMaxMB.toFixed(0)} MB
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Thread Count</h3>
          <p className="text-2xl font-bold text-green-600">
            {healthData.threadCount}
          </p>
          <p className="text-xs text-gray-400">
            Peak: {healthData.peakThreadCount}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">System Load</h3>
          <p className="text-2xl font-bold text-purple-600">
            {healthData.systemLoadAverage.toFixed(2)}
          </p>
          <p className="text-xs text-gray-400">
            CPUs: {healthData.availableProcessors}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Transactions</h3>
          <p className="text-2xl font-bold text-indigo-600">
            {healthData.transactionMetrics?.totalTransactions?.toLocaleString() || 0}
          </p>
          <p className="text-xs text-gray-400">
            Last hour: {healthData.transactionMetrics?.transactionsLastHour?.toLocaleString() || 0}
          </p>
        </div>
      </div>

      {/* Database Status Card */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Database Connection</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <p className={`font-medium ${healthData.databaseMetrics?.connected ? 'text-green-600' : 'text-red-600'}`}>
              {healthData.databaseMetrics?.connected ? 'Connected' : 'Disconnected'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Database</p>
            <p className="font-medium">{healthData.databaseMetrics?.databaseProductName || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Version</p>
            <p className="font-medium">{healthData.databaseMetrics?.databaseVersion || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Driver</p>
            <p className="font-medium">{healthData.databaseMetrics?.driverName || 'Unknown'}</p>
          </div>
          {healthData.databaseMetrics?.error && (
            <div className="col-span-2">
              <p className="text-sm text-gray-500">Error</p>
              <p className="font-medium text-red-600">{healthData.databaseMetrics.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Load Card */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Transaction Load</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Last Minute</p>
            <p className="text-xl font-bold text-blue-600">
              {healthData.transactionMetrics?.transactionsLastMinute?.toLocaleString() || 0}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Last Hour</p>
            <p className="text-xl font-bold text-green-600">
              {healthData.transactionMetrics?.transactionsLastHour?.toLocaleString() || 0}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Last Day</p>
            <p className="text-xl font-bold text-purple-600">
              {healthData.transactionMetrics?.transactionsLastDay?.toLocaleString() || 0}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Per Minute (avg)</p>
            <p className="text-xl font-bold text-orange-600">
              {healthData.transactionMetrics?.transactionsPerMinute?.toFixed(2) || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Memory Chart */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Memory Usage Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={history}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="heapUsed" stroke="#8884d8" fill="#8884d8" name="Heap Used (MB)" />
            <Area type="monotone" dataKey="heapMax" stroke="#82ca9d" fill="#82ca9d" name="Heap Max (MB)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Thread Count Chart */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Thread Count Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="threadCount" stroke="#8884d8" name="Thread Count" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* System Load Chart */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">System Load Average Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="systemLoad" stroke="#ffc658" name="System Load" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Transaction Load Chart */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Transaction Load Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="transactionsLastMinute" stroke="#8884d8" name="Transactions/Min" />
            <Line type="monotone" dataKey="transactionsLastHour" stroke="#82ca9d" name="Transactions/Hour" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* System Information */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">System Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Operating System</p>
            <p className="font-medium">{healthData.osName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">OS Version</p>
            <p className="font-medium">{healthData.osVersion}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Available Processors</p>
            <p className="font-medium">{healthData.availableProcessors}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Daemon Threads</p>
            <p className="font-medium">{healthData.daemonThreadCount}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Last Updated</p>
            <p className="font-medium">{new Date(healthData.timestamp).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
