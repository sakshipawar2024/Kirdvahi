import React, { useState, useEffect } from 'react';
import { useSchool, School } from '../contexts/SchoolContext';
import { useNavigate } from 'react-router-dom';
import { School as SchoolIcon, Building2, Loader2, Lock, X } from 'lucide-react';
import { schoolService } from '../services/schoolService';
import SchoolInitializer from './SchoolInitializer';

const SchoolSelection: React.FC = () => {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authSchool, setAuthSchool] = useState<School | null>(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const { selectSchool, authenticateSchool } = useSchool();
  const navigate = useNavigate();

  useEffect(() => {
    loadSchools();
  }, []);

  const loadSchools = async () => {
    try {
      setLoading(true);
      setError(null);
      const schoolsData = await schoolService.getAll();
      setSchools(schoolsData);
    } catch (err: any) {
      console.error('Error loading schools:', err);
      // Check if it's a Firebase configuration error
      if (err?.message?.includes('Firebase') || err?.code === 'failed-precondition') {
        setError('Firebase कॉन्फिगरेशन त्रुटी. कृपया .env फाइल तपासा आणि Firebase सेटिंग्ज व्हेरिफाई करा.');
      } else {
        setError('शाळा लोड करताना त्रुटी आली. कृपया पुन्हा प्रयत्न करा.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSchool = (school: School) => {
    setAuthSchool(school);
    setPassword('');
    setAuthError('');
  };

  const closeAuthModal = () => {
    if (authLoading) {
      return;
    }
    setAuthSchool(null);
    setPassword('');
    setAuthError('');
  };

  const verifySchoolPassword = async () => {
    if (!authSchool) {
      return;
    }
    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      setAuthError('कृपया पासवर्ड टाका.');
      return;
    }

    try {
      setAuthLoading(true);
      setAuthError('');
      const latestSchool = await schoolService.getById(authSchool.id);
      const expectedPassword = String(latestSchool?.adminPassword || '').trim();

      if (!latestSchool || trimmedPassword !== expectedPassword) {
        setAuthError('चुकीचा पासवर्ड. कृपया पुन्हा प्रयत्न करा.');
        return;
      }

      selectSchool(latestSchool);
      authenticateSchool(latestSchool.id);
      localStorage.setItem('admin_session', 'true');
      localStorage.setItem('admin_school_id', latestSchool.id);
      setAuthSchool(null);
      setPassword('');
      navigate('/admin');
    } catch {
      setAuthError('प्रमाणीकरण करताना त्रुटी आली. कृपया पुन्हा प्रयत्न करा.');
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center relative"
        style={{
          backgroundImage: "url('/classroom.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-40"></div>
        <div className="relative z-10 text-center bg-white bg-opacity-90 backdrop-blur-sm rounded-lg p-8 shadow-xl">
          <Loader2 className="w-12 h-12 text-amber-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-800 font-medium">शाळा लोड होत आहे...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center relative px-4"
        style={{
          backgroundImage: "url('/classroom.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-40"></div>
        <div className="relative z-10 bg-white bg-opacity-95 backdrop-blur-sm rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center">
            <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <SchoolIcon className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">त्रुटी</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={loadSchools}
              className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              पुन्हा प्रयत्न करा
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen py-12 px-4 relative"
      style={{
        backgroundImage: "url('/classroom.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Dark overlay for content visibility */}
      <div className="absolute inset-0 bg-black bg-opacity-40"></div>
      
      {/* Content container with backdrop blur for better readability */}
      <div className="relative z-10 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="bg-white bg-opacity-90 backdrop-blur-sm w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 className="w-10 h-10 text-amber-600" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">
            शाळा निवडा
          </h1>
          <p className="text-white text-lg drop-shadow-md">
            कृपया आपली शाळा निवडा
          </p>
        </div>

        {schools.length === 0 ? (
          <SchoolInitializer />
        ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {schools.map((school) => (
              <button
                key={school.id}
                onClick={() => handleSelectSchool(school)}
                className="bg-white bg-opacity-95 backdrop-blur-sm rounded-lg shadow-lg hover:shadow-2xl p-8 text-center transition-all duration-200 hover:scale-105 border-2 border-white hover:border-amber-400 flex items-center justify-center"
              >
                <h3 className="text-2xl font-bold text-gray-800">
                  {school.name}
                </h3>
              </button>
            ))}
          </div>
          {authSchool && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black bg-opacity-60" onClick={closeAuthModal}></div>
              <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
                <button
                  onClick={closeAuthModal}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="text-center mb-6">
                  <div className="bg-amber-100 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Lock className="w-7 h-7 text-amber-700" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">शाळा प्रमाणीकरण</h2>
                  <p className="text-sm text-gray-600">{authSchool.name}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">पासवर्ड</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void verifySchoolPassword();
                        }
                      }}
                      autoFocus
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      placeholder="शाळेचा पासवर्ड टाका"
                    />
                  </div>

                  {authError && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {authError}
                    </div>
                  )}

                  <button
                    onClick={() => void verifySchoolPassword()}
                    disabled={authLoading}
                    className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white py-3 px-4 rounded-lg font-medium transition-colors"
                  >
                    {authLoading ? 'पडताळणी होत आहे...' : 'पडताळणी करा'}
                  </button>
                </div>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
};

export default SchoolSelection;


