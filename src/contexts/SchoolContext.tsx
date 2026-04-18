import React, { createContext, useContext, useState, useEffect } from 'react';

export interface School {
  id: string;
  name: string;
  adminId: string;
  adminPassword: string;
}

interface SchoolContextType {
  selectedSchool: School | null;
  isSchoolAuthenticated: boolean;
  selectSchool: (school: School) => void;
  authenticateSchool: (schoolId: string) => void;
  clearSchoolAuthentication: () => void;
  clearSchool: () => void;
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [authenticatedSchoolId, setAuthenticatedSchoolId] = useState<string | null>(null);

  useEffect(() => {
    // Load selected school from sessionStorage (cleared when browser closes)
    // This ensures school selection page shows every time the app is opened
    const savedSchool = sessionStorage.getItem('selected_school');
    if (savedSchool) {
      try {
        const parsedSchool = JSON.parse(savedSchool) as School;
        setSelectedSchool(parsedSchool);

        // School authentication is session-based and tied to the selected school ID.
        const savedAuthenticatedSchoolId = sessionStorage.getItem('authenticated_school_id');
        if (savedAuthenticatedSchoolId === parsedSchool.id) {
          setAuthenticatedSchoolId(savedAuthenticatedSchoolId);
        } else {
          sessionStorage.removeItem('authenticated_school_id');
        }
      } catch (error) {
        console.error('Error loading school from sessionStorage:', error);
        sessionStorage.removeItem('selected_school');
        sessionStorage.removeItem('authenticated_school_id');
      }
    }
  }, []);

  const selectSchool = (school: School) => {
    // Switching schools always requires re-authentication for that school.
    if (authenticatedSchoolId !== school.id) {
      setAuthenticatedSchoolId(null);
      sessionStorage.removeItem('authenticated_school_id');
    }
    setSelectedSchool(school);
    sessionStorage.setItem('selected_school', JSON.stringify(school));
  };

  const authenticateSchool = (schoolId: string) => {
    setAuthenticatedSchoolId(schoolId);
    sessionStorage.setItem('authenticated_school_id', schoolId);
  };

  const clearSchoolAuthentication = () => {
    setAuthenticatedSchoolId(null);
    sessionStorage.removeItem('authenticated_school_id');
  };

  const isSchoolAuthenticated = !!selectedSchool && authenticatedSchoolId === selectedSchool.id;

  const clearSchool = () => {
    setSelectedSchool(null);
    setAuthenticatedSchoolId(null);
    sessionStorage.removeItem('selected_school');
    sessionStorage.removeItem('authenticated_school_id');
    // Also clear admin session when school is cleared
    localStorage.removeItem('admin_session');
    localStorage.removeItem('admin_school_id');
  };

  return (
    <SchoolContext.Provider
      value={{
        selectedSchool,
        isSchoolAuthenticated,
        selectSchool,
        authenticateSchool,
        clearSchoolAuthentication,
        clearSchool
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => {
  const context = useContext(SchoolContext);
  if (context === undefined) {
    throw new Error('useSchool must be used within a SchoolProvider');
  }
  return context;
};


