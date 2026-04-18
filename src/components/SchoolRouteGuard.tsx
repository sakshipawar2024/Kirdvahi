import React from 'react';
import { useSchool } from '../contexts/SchoolContext';
import SchoolSelection from './SchoolSelection';
import SchoolHeader from './SchoolHeader';

interface SchoolRouteGuardProps {
  children: React.ReactNode;
}

const SchoolRouteGuard: React.FC<SchoolRouteGuardProps> = ({ children }) => {
  const { selectedSchool, isSchoolAuthenticated } = useSchool();

  if (!selectedSchool || !isSchoolAuthenticated) {
    return <SchoolSelection />;
  }

  return (
    <>
      <SchoolHeader />
      {children}
    </>
  );
};

export default SchoolRouteGuard;


