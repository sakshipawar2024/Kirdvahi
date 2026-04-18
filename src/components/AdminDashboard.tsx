import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import TableOfContents from './TableOfContents';
import AdminHeader from './AdminHeader';

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100">
      {/* Admin Header with Stats */}
      <AdminHeader title="Admin Dashboard" showStats={true} />

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Admin Actions */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8 print:hidden">
          <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">Quick Actions</h2>
          <div className="flex flex-col md:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => navigate('/admin/entry')}
              className="w-full md:w-96 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add New Entry
            </button>
            <button
              onClick={() => navigate('/admin/accounts')}
              className="w-full md:w-96 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Users className="w-5 h-5" />
              Manage Accounts
            </button>
          </div>
        </div>

        {/* Main Content - Table of Contents with Admin Features */}
        <TableOfContents hideAdminHeader={true} />
      </div>
    </div>
  );
};

export default AdminDashboard;
