import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchool } from '../contexts/SchoolContext';
import { Building2 } from 'lucide-react';

const SchoolHeader: React.FC = () => {
  const { selectedSchool, clearSchool } = useSchool();
  const navigate = useNavigate();

  if (!selectedSchool) {
    return null;
  }

  const handleChangeSchool = () => {
    clearSchool();
    navigate('/');
  };

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm print:hidden">
      <div className="container mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-700 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
          <Building2 className="w-4 h-4" />
          <span className="text-sm font-medium">{selectedSchool.name}</span>
        </div>
        <button
          onClick={handleChangeSchool}
          className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
        >
          Change School
        </button>
      </div>
    </div>
  );
};

export default SchoolHeader;

