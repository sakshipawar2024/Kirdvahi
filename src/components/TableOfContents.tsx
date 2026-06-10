import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { BookOpen, Plus, Edit3, Edit, Trash2, Save, X, Download, Wifi, WifiOff, FileText, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { accountsFirebase, entriesFirebase, Account, Entry, handleFirebaseError } from '../services/firebaseService';
import AdminHeader from './AdminHeader';
import { formatDate, formatDateForFilename } from '../utils/dateUtils';
import { normalizeAccountNumber } from '../utils/accountUtils';

const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripAccountName = (details: string, accounts: { [key: string]: string }) => {
  if (!details) return '';
  for (const name of Object.values(accounts)) {
    const safeName = escapeRegExp(name);
    const regex = new RegExp(`(^|[\n\r])\s*${safeName}\s*[:：]*\s*`, 'g');
    details = details.replace(regex, '$1');
  }
  return details.trim();
};

interface TableOfContentsProps {
  hideAdminHeader?: boolean;
}

const TableOfContents: React.FC<TableOfContentsProps> = ({ hideAdminHeader = false }) => {
  const { selectedSchool } = useSchool();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editAccountName, setEditAccountName] = useState('');
  const [editAccountNumber, setEditAccountNumber] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { isAdmin, logout } = useAuth();

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load accounts from Firebase
  useEffect(() => {
    if (selectedSchool) {
      loadAccounts();
    } else {
      setError('कृपया प्रथम शाळा निवडा.');
    }
  }, [selectedSchool]);

  const loadAccounts = async () => {
    try {
      setError(null);
      if (!selectedSchool) {
        setError('कृपया प्रथम शाळा निवडा.');
        return;
      }
      const accountsData = await accountsFirebase.getAll(selectedSchool.id);
      setAccounts(accountsData);
    } catch (err) {
      setError(handleFirebaseError(err));
      console.error('Error loading accounts:', err);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
      return;
    }
    
    if (newAccountName.trim() && newAccountNumber.trim()) {
      const normalizedNewAccountNumber = normalizeAccountNumber(newAccountNumber);
      // Check if account number already exists
      const existingAccount = accounts.find(account => normalizeAccountNumber(account.khateNumber) === normalizedNewAccountNumber);
      if (existingAccount) {
        alert('या खाते नंबरचे खाते आधीच अस्तित्वात आहे!');
        return;
      }
      
      try {
        if (!selectedSchool) {
          alert('कृपया प्रथम शाळा निवडा.');
          return;
        }
        await accountsFirebase.create(selectedSchool.id, {
          khateNumber: normalizedNewAccountNumber,
          name: newAccountName.trim()
        });
        
        setNewAccountName('');
        setNewAccountNumber('');
        setShowAddForm(false);
        loadAccounts(); // Reload accounts
      } catch (err) {
        const errorMessage = handleFirebaseError(err);
        alert('खाते जोडताना त्रुटी: ' + errorMessage);
      }
    }
  };

  const handleEditAccount = (account: Account) => {
    if (!isOnline) {
      alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
      return;
    }
    setEditingAccount(account.id!);
    setEditAccountName(account.name);
    setEditAccountNumber(account.khateNumber);
  };

  const handleSaveEdit = async () => {
    if (!isOnline) {
      alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
      return;
    }
    
    if (editingAccount && editAccountName.trim() && editAccountNumber.trim()) {
      const normalizedEditAccountNumber = normalizeAccountNumber(editAccountNumber);
      const normalizedEditAccountName = editAccountName.trim();
      // Check if the new account number already exists (only if it's different from current)
      const currentAccount = accounts.find(acc => acc.id === editingAccount);
      if (currentAccount && normalizedEditAccountNumber !== normalizeAccountNumber(currentAccount.khateNumber)) {
        const existingAccount = accounts.find(acc => normalizeAccountNumber(acc.khateNumber) === normalizedEditAccountNumber && acc.id !== editingAccount);
        if (existingAccount) {
          alert('या खाते नंबरचे खाते आधीच अस्तित्वात आहे!');
          return;
        }
      }
      
      try {
        if (!selectedSchool) {
          alert('कृपया प्रथम शाळा निवडा.');
          return;
        }
        await accountsFirebase.update(selectedSchool.id, editingAccount, { 
          name: normalizedEditAccountName,
          khateNumber: normalizedEditAccountNumber
        });
        const previousAccount = currentAccount;
        setEditingAccount(null);
        setEditAccountName('');
        setEditAccountNumber('');
        loadAccounts(); // Reload accounts
        
        // Trigger a page refresh to update account names in other components
        if (previousAccount) {
          window.dispatchEvent(new CustomEvent('accountUpdated', {
            detail: {
              oldKhateNumber: normalizeAccountNumber(previousAccount.khateNumber),
              newKhateNumber: normalizedEditAccountNumber,
              oldName: previousAccount.name,
              newName: normalizedEditAccountName
            }
          }));
        }
        window.dispatchEvent(new Event('accountNameUpdated'));
      } catch (err) {
        alert('खाते अपडेट करताना त्रुटी: ' + handleFirebaseError(err));
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingAccount(null);
    setEditAccountName('');
    setEditAccountNumber('');
  };

  const handleDeleteAccount = async (account: Account) => {
    if (!isOnline) {
      alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
      return;
    }
    
    if (confirm('या खात्याला हटवायचे आहे का?')) {
      try {
        if (!selectedSchool) {
          alert('कृपया प्रथम शाळा निवडा.');
          return;
        }
        await accountsFirebase.delete(selectedSchool.id, account.id!, account.khateNumber);
        loadAccounts(); // Reload accounts
      } catch (err) {
        alert('खाते हटवताना त्रुटी: ' + handleFirebaseError(err));
      }
    }
  };

  const handleExportAccountsToExcel = () => {
    if (accounts.length === 0) {
      alert('निर्यात करण्यासाठी कोणतेही खाते उपलब्ध नाहीत!');
      return;
    }

    // Prepare data for Excel - exactly as shown in the table
    const excelData = accounts.map((account, index) => ({
      'खाते नं.': account.khateNumber,
      'नाव': account.name,
      'किर्द पान नं.': '',
      'क्रमांक': index + 1
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'खतावणी अनुक्रमणिका');

    // Generate Excel file and download
    XLSX.writeFile(wb, `खतावणी_अनुक्रमणिका_${formatDateForFilename(new Date())}.xlsx`);
  };

  const handleExportAllAccountsTransactions = async () => {
    if (accounts.length === 0) {
      alert('निर्यात करण्यासाठी कोणतेही खाते उपलब्ध नाहीत!');
      return;
    }

    try {
      // Load all entries from Firebase
      if (!selectedSchool) {
        alert('कृपया प्रथम शाळा निवडा.');
        return;
      }
      const allEntries = await entriesFirebase.getAll(selectedSchool.id);
      
      if (allEntries.length === 0) {
        alert('निर्यात करण्यासाठी कोणत्याही नोंदी उपलब्ध नाहीत!');
        return;
      }

      // Prepare comprehensive Excel data
      const excelData: any[] = [];

      // Sort accounts by account number numerically
      const sortedAccounts = [...accounts].sort((a, b) => {
        const numA = parseInt(a.khateNumber);
        const numB = parseInt(b.khateNumber);
        return numA - numB;
      });

      const accountNameMap: { [key: string]: string } = {};
      accounts.forEach(acc => { accountNameMap[normalizeAccountNumber(acc.khateNumber)] = acc.name; });

      sortedAccounts.forEach((account, accountIndex) => {
        // Filter entries for this account
        const accountEntries = allEntries.filter(entry => entry.accountNumber === account.khateNumber);
        
        if (accountEntries.length > 0) {
          // Add account header row with account number and name in first column
          excelData.push({
            'खाते नं. व नाव': `खाते नं. ${account.khateNumber}-${account.name}`,
            'तारीख': '',
            'किर्द पान नं.': '',
            'तपशील': '',
            'जमा रक्कम': '',
            'नावे रक्कम': ''
          });

          // Sort entries by date
          const sortedEntries = [...accountEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          // Add entries
          sortedEntries.forEach(entry => {
            excelData.push({
              'खाते नं. व नाव': '',
              'तारीख': formatDate(entry.date),
              'किर्द पान नं.': '',
              'तपशील': stripAccountName(entry.details, accountNameMap),
              'जमा रक्कम': entry.type === 'जमा' ? entry.amount.toFixed(2) : '-',
              'नावे रक्कम': entry.type === 'नावे' ? entry.amount.toFixed(2) : '-'
            });
          });

          // Calculate totals for this account
          const jamaEntries = accountEntries.filter(entry => entry.type === 'जमा');
          const naveEntries = accountEntries.filter(entry => entry.type === 'नावे');
          const jamaTotal = jamaEntries.reduce((sum, entry) => sum + entry.amount, 0);
          const naveTotal = naveEntries.reduce((sum, entry) => sum + entry.amount, 0);
          const balance = jamaTotal - naveTotal;

          // Add total row
          excelData.push({
            'खाते नं. व नाव': '',
            'तारीख': '',
            'किर्द पान नं.': '',
            'तपशील': 'एकूण:',
            'जमा रक्कम': jamaTotal.toFixed(2),
            'नावे रक्कम': naveTotal.toFixed(2)
          });

          // Add balance row
          excelData.push({
            'खाते नं. व नाव': '',
            'तारीख': '',
            'किर्द पान नं.': '',
            'तपशील': 'शिल्लक:',
            'जमा रक्कम': '',
            'नावे रक्कम': `${Math.abs(balance).toFixed(2)}`
          });

          // Add balance row

          // Removed extra empty rows between accounts
        }
      });

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'सर्व खाती व्यवहार');

      // Generate Excel file and download
      XLSX.writeFile(wb, `सर्व_खाती_व्यवहार_${formatDateForFilename(new Date())}.xlsx`);
    } catch (err) {
      alert('निर्यात करताना त्रुटी: ' + handleFirebaseError(err));
    }
  };

  // Split accounts for better 2-page layout
  // Sort accounts numerically before splitting
  const sortedAccounts = [...accounts].sort((a, b) => {
    const numA = parseInt(a.khateNumber);
    const numB = parseInt(b.khateNumber);
    return numA - numB;
  });
  
  const midPoint = Math.ceil(sortedAccounts.length / 2);
  const leftColumn = sortedAccounts.slice(0, midPoint);
  const rightColumn = sortedAccounts.slice(midPoint);


  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-lg">
          <p className="text-red-600 marathi-font mb-4">त्रुटी: {error}</p>
          <button
            onClick={loadAccounts}
            className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg"
          >
            पुन्हा प्रयत्न करा
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100">
      {/* Admin Header */}
      {isAdmin && !hideAdminHeader && <AdminHeader title="किर्दवही" showStats={true} />}
      
      {/* Combined Header with School Building Background */}
      <div className="combined-header shadow-lg print:shadow-none">
        <div className="school-header-section marathi-font text-amber-700 hidden print:block">
          {selectedSchool?.name || 'टी झेड पवार माध्यमिक विद्यालय गोराणे  ता. बागलाण जि. नाशिक'}
        </div>

        {/* Main Header Section - Only show for non-admin users */}
        {!isAdmin && (
          <div className="main-header-section print:hidden">
            <div className="container mx-auto px-4">
              <div className="flex flex-col items-center justify-center">
                <div className="flex items-center gap-3 mt-4 mb-2">
                  <BookOpen className="w-8 h-8" />
                  <h1 className="text-3xl md:text-4xl font-bold marathi-font">किर्दवही</h1>
                </div>
                <p className="text-center text-white english-font">Marathi Ledger Book</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Offline Alert */}
      {!isOnline && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 text-center marathi-font print:hidden">
          <strong>इंटरनेट कनेक्शन नाही!</strong> तुम्ही फक्त डेटा पाहू शकता. संपादन करण्यासाठी इंटरनेट कनेक्शन आवश्यक आहे.
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 print:px-1 print:py-1">
        {/* Print-only Account List Header */}
        <div className="hidden print:block text-center mb-4">
          <h2 className="text-lg font-bold marathi-font">खतावणी अनुक्रमणिका</h2>
        </div>
        
        <div className="bg-white rounded-lg page-shadow ledger-border p-6 md:p-8 print:shadow-none print:border-0 print:rounded-none print:p-1">
          {/* Page Header */}
          <div className="text-center mb-8 print:mb-2">
            <h2 className="text-2xl md:text-3xl font-bold text-amber-800 marathi-font mb-2 print:text-base print:mb-1">खतावणी अनुक्रमणिका</h2>
            <div className="flex justify-between items-center text-sm text-amber-600 english-font print:hidden">
              <span>Total Accounts: {accounts.length}</span>
              <span></span>
            </div>
            <div className="mt-4 h-0.5 bg-amber-600 print:hidden"></div>
          </div>

          {/* Action Buttons */}
          {isAdmin && (
            <div className="text-center mb-6 flex flex-wrap gap-4 justify-center print:hidden">
              <Link
                to="/admin/entry"
                className={`px-6 py-3 rounded-lg font-medium marathi-font transition-colors inline-flex items-center gap-2 ${
                  isOnline 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                }`}
                onClick={(e) => {
                  if (!isOnline) {
                    e.preventDefault();
                    alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
                  }
                }}
              >
                <FileText className="w-5 h-5" />
                किर्द लिहा / बघा
              </Link>
              <button
                onClick={() => {
                  if (!isOnline) {
                    alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
                    return;
                  }
                  setShowAddForm(!showAddForm);
                }}
                disabled={!isOnline}
                className={`px-6 py-3 rounded-lg font-medium marathi-font transition-colors inline-flex items-center gap-2 ${
                  isOnline 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                }`}
              >
                <Plus className="w-5 h-5" />
                खाते जोडा
              </button>
              <Link
                to="/admin/account-summary"
                className={`px-6 py-3 rounded-lg font-medium marathi-font transition-colors inline-flex items-center gap-2 ${
                  isOnline
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                }`}
                onClick={(e) => {
                  if (!isOnline) {
                    e.preventDefault();
                    alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
                  }
                }}
              >
                <BarChart3 className="w-5 h-5" />
                एकूण जमा/नावे
              </Link>
            </div>
          )}

          {/* Add Account Form */}
          {showAddForm && isOnline && isAdmin && (
            <div className="bg-blue-50 p-6 rounded-lg border-2 border-blue-200 mb-6 print:hidden">
              <h3 className="text-lg font-bold text-blue-800 marathi-font mb-4">नवीन खाते जोडा</h3>
              <form onSubmit={handleAddAccount} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-blue-800 marathi-font mb-2">
                      खाते नंबर *
                    </label>
                    <input
                      type="text"
                      value={newAccountNumber}
                      onChange={(e) => setNewAccountNumber(e.target.value)}
                      placeholder="खाते नंबर टाका..."
                      required
                      className="w-full p-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 marathi-font"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-800 marathi-font mb-2">
                      खात्याचे नाव *
                    </label>
                    <input
                      type="text"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      placeholder="खात्याचे नाव टाका..."
                      required
                      className="w-full p-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 marathi-font"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium english-font transition-colors"
                  >
                    जोडा
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewAccountName('');
                      setNewAccountNumber('');
                    }}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium english-font transition-colors"
                  >
                    रद्द करा
                  </button>
                </div>
              </form>
            </div>
          )}

          {accounts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-xl font-semibold marathi-font mb-2">कोणतेही खाते उपलब्ध नाही</h3>
            </div>
          ) : (
            <>
              {/* Table Headers - Optimized for Print */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:grid-cols-2 print:gap-1">
                {/* Left Column */}
                <div>
                  <div className="bg-amber-500 text-white p-3 rounded-t-lg print:rounded-none print:p-0.5">
                    <div className="grid grid-cols-12 gap-2 font-semibold text-sm marathi-font print:text-[6px] print:gap-1">
                      <div className="col-span-3 print:col-span-2">खाते नं.</div>
                      <div className="col-span-7 print:col-span-8">नाव</div>
                      {isAdmin && <div className="col-span-2 print:hidden">कृती</div>}
                    </div>
                  </div>
                  <div className="border-2 border-amber-500 border-t-0 rounded-b-lg print:border print:border-gray-400 print:rounded-none">
                    {leftColumn.map((account) => (
                      <div key={account.id} className="border-b border-amber-200 last:border-b-0 print:border-b print:border-gray-300">
                        {editingAccount === account.id ? (
                          <div className="grid grid-cols-12 gap-2 p-3 text-sm print:hidden">
                            <div className="col-span-3 font-medium text-amber-700 english-font flex items-center">{account.khateNumber}</div>
                            <div className="col-span-3">
                              <input
                                type="text"
                                value={editAccountNumber}
                                onChange={(e) => setEditAccountNumber(e.target.value)}
                                className="w-full p-1 border border-amber-300 rounded text-xs english-font"
                                placeholder="खाते नं."
                              />
                            </div>
                            <div className="col-span-4">
                              <input
                                type="text"
                                value={editAccountName}
                                onChange={(e) => setEditAccountName(e.target.value)}
                                className="w-full p-1 border border-amber-300 rounded text-xs marathi-font"
                                placeholder="खात्याचे नाव"
                              />
                            </div>
                            <div className="col-span-2 flex gap-1">
                              <button
                                onClick={handleSaveEdit}
                                className="bg-green-500 hover:bg-green-600 text-white p-1 rounded text-xs"
                              >
                                <Save className="w-3 h-3" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="bg-gray-500 hover:bg-gray-600 text-white p-1 rounded text-xs"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-12 gap-2 p-3 text-sm print:p-0.5 print:text-[5px] print:gap-1 print:leading-tight">
                            <div className="col-span-3 font-medium text-amber-700 english-font print:col-span-2">{account.khateNumber}</div>
                            <div className={`${isAdmin ? 'col-span-7' : 'col-span-9'} text-gray-800 marathi-font hover:text-amber-700 transition-colors ${isAdmin ? 'print:col-span-8' : 'print:col-span-10'}`}>
                              <Link to={`/admin/ledger/${encodeURIComponent(account.khateNumber)}`} className="block print:no-underline">
                                {account.name}
                              </Link>
                            </div>
                            {isAdmin && (
                              <div className="col-span-2 flex gap-1 print:hidden">
                                <button
                                  onClick={() => handleEditAccount(account)}
                                  disabled={!isOnline}
                                  className={`p-1 rounded text-xs ${
                                    isOnline 
                                      ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  }`}
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteAccount(account)}
                                  disabled={!isOnline}
                                  className={`p-1 rounded text-xs ${
                                    isOnline 
                                      ? 'bg-red-500 hover:bg-red-600 text-white' 
                                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  }`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column */}
                <div className="print:page-break-before-always">
                  <div className="bg-amber-500 text-white p-3 rounded-t-lg print:rounded-none print:p-0.5">
                    <div className="grid grid-cols-12 gap-2 font-semibold text-sm marathi-font print:text-[6px] print:gap-1">
                      <div className="col-span-3 print:col-span-2">खाते नं.</div>
                      <div className="col-span-7 print:col-span-8">नाव</div>
                      {isAdmin && <div className="col-span-2 print:hidden">कृती</div>}
                    </div>
                  </div>
                  <div className="border-2 border-amber-500 border-t-0 rounded-b-lg print:border print:border-gray-400 print:rounded-none">
                    {rightColumn.map((account) => (
                      <div key={account.id} className="border-b border-amber-200 last:border-b-0 print:border-b print:border-gray-300">
                        {editingAccount === account.id ? (
                          <div className="grid grid-cols-12 gap-2 p-3 text-sm print:hidden">
                            <div className="col-span-3 font-medium text-amber-700 english-font flex items-center">{account.khateNumber}</div>
                            <div className="col-span-3">
                              <input
                                type="text"
                                value={editAccountNumber}
                                onChange={(e) => setEditAccountNumber(e.target.value)}
                                className="w-full p-1 border border-amber-300 rounded text-xs english-font"
                                placeholder="खाते नं."
                              />
                            </div>
                            <div className="col-span-4">
                              <input
                                type="text"
                                value={editAccountName}
                                onChange={(e) => setEditAccountName(e.target.value)}
                                className="w-full p-1 border border-amber-300 rounded text-xs marathi-font"
                                placeholder="खात्याचे नाव"
                              />
                            </div>
                            <div className="col-span-2 flex gap-1">
                              <button
                                onClick={handleSaveEdit}
                                className="bg-green-500 hover:bg-green-600 text-white p-1 rounded text-xs"
                              >
                                <Save className="w-3 h-3" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="bg-gray-500 hover:bg-gray-600 text-white p-1 rounded text-xs"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-12 gap-2 p-3 text-sm print:p-0.5 print:text-[5px] print:gap-1 print:leading-tight">
                            <div className="col-span-3 font-medium text-amber-700 english-font print:col-span-2">{account.khateNumber}</div>
                            <div className={`${isAdmin ? 'col-span-7' : 'col-span-9'} text-gray-800 marathi-font hover:text-amber-700 transition-colors ${isAdmin ? 'print:col-span-8' : 'print:col-span-10'}`}>
                              <Link to={`/admin/ledger/${encodeURIComponent(account.khateNumber)}`} className="block print:no-underline">
                                {account.name}
                              </Link>
                            </div>
                            {isAdmin && (
                              <div className="col-span-2 flex gap-1 print:hidden">
                                <button
                                  onClick={() => handleEditAccount(account)}
                                  disabled={!isOnline}
                                  className={`p-1 rounded text-xs ${
                                    isOnline 
                                      ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  }`}
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteAccount(account)}
                                  disabled={!isOnline}
                                  className={`p-1 rounded text-xs ${
                                    isOnline 
                                      ? 'bg-red-500 hover:bg-red-600 text-white' 
                                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  }`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Export Buttons */}
              {isAdmin && (
                <div className="mt-6 text-center print:hidden">
                  <div className="flex flex-wrap gap-4 justify-center">
                    <button
                      onClick={handleExportAccountsToExcel}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-medium marathi-font transition-colors inline-flex items-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      खतावणी अनुक्रमणिका
                    </button>
                    <button
                      onClick={handleExportAllAccountsTransactions}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium marathi-font transition-colors inline-flex items-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      खतावणी Excel
                    </button>
                    <Link
                      to="/admin/account-summary"
                      className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium marathi-font transition-colors inline-flex items-center gap-2"
                    >
                      <BarChart3 className="w-5 h-5" />
                      एकूण जमा/नावे
                    </Link>
                  </div>
                </div>
              )}

            </>
          )}

          {/* किर्दवही बघा Option for Users */}
          {!isAdmin && (
            <div className="mt-8 text-center print:hidden">
              <Link
                to="/admin/entry"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-medium marathi-font transition-colors inline-flex items-center gap-3 text-lg"
              >
                <FileText className="w-6 h-6" />
                किर्द लिहा / बघा
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TableOfContents;