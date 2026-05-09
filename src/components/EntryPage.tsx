import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { ArrowLeft, Save, X, BookOpen, Printer, Edit3, Trash2, Plus, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { accountsFirebase, entriesFirebase, Entry, handleFirebaseError } from '../services/firebaseService';
import AdminHeader from './AdminHeader';
import { formatDate, formatDateForFilename } from '../utils/dateUtils';
import { normalizeAccountNumber, resolveCurrentAccountNumber } from '../utils/accountUtils';

// Helper to highlight account name at start of details
const highlightAccountName = (details: string, accounts: { [key: string]: string }): React.ReactNode => {
  if (!details) return details;
  // Find if details starts with any account name
  const found = Object.values(accounts).find(name => details.startsWith(name));
  if (found) {
    // Remove any colons or spaces after the account name
    let rest = details.slice(found.length).replace(/^[:\s]+/, '');
    return (
      <span className="block">
        <span style={{ color: '#1d4ed8', fontWeight: 'bold', display: 'block' }}>{found}:</span>
        {rest ? <span className="block mt-1">{rest}</span> : null}
      </span>
    );
  }
  return details;
};

const renderAmountWithBreak = (amount: number) => {
  const [wholePart, decimalPart] = amount.toFixed(2).split('.');

  return (
    <span>
      {wholePart}
      <span className="entry-amount-break">.{decimalPart}</span>
    </span>
  );
};

const hasEntryAmount = (amount: number | null | undefined): amount is number => {
  return typeof amount === 'number' && !Number.isNaN(amount);
};

const isDateOnlyEntry = (entry: Entry | undefined) => {
  if (!entry) return false;

  const hasAccount = Boolean(entry.accountNumber?.trim());
  const hasReceipt = Boolean(entry.receiptNumber?.trim());
  const hasDetails = Boolean(entry.details?.trim());
  const hasNonZeroAmount = hasEntryAmount(entry.amount) && entry.amount !== 0;

  return !hasAccount && !hasReceipt && !hasDetails && !hasNonZeroAmount;
};

const shouldShowAmount = (entry: Entry | undefined) => {
  if (!entry || !hasEntryAmount(entry.amount)) {
    return false;
  }

  if (isDateOnlyEntry(entry)) {
    return false;
  }

  return true;
};

const EntryPage: React.FC = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [accounts, setAccounts] = useState<{ [key: string]: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [jamaFormData, setJamaFormData] = useState({
    date: '',
    accountNumber: '',
    receiptNumber: '',
    details: '',
    amount: ''
  });
  const [naveFormData, setNaveFormData] = useState({
    date: '',
    accountNumber: '',
    receiptNumber: '',
    details: '',
    amount: ''
  });
  const [sharedEntryDate, setSharedEntryDate] = useState('');
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editFormData, setEditFormData] = useState({
    date: '',
    accountNumber: '',
    receiptNumber: '',
    details: '',
    amount: ''
  });
  const { isAdmin } = useAuth();
  const { selectedSchool } = useSchool();
  const [searchParams, setSearchParams] = useSearchParams();
  const prefilledAccountAppliedRef = useRef(false);

  const prefilledAccountNumber = (searchParams.get('accountNumber') || '').trim();

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

  // (Reverted) Removed dynamic filler row print logic

  // Load accounts and entries from Firebase
  useEffect(() => {
    if (selectedSchool) {
      loadData();
    }
    
    // Listen for account name updates
    const handleAccountUpdate = (event: Event) => {
      const accountUpdateEvent = event as CustomEvent<{
        oldKhateNumber?: string;
        newKhateNumber?: string;
      }>;

      if (accountUpdateEvent.detail?.oldKhateNumber && accountUpdateEvent.detail?.newKhateNumber) {
        const currentPrefilledNumber = normalizeAccountNumber(searchParams.get('accountNumber'));

        if (currentPrefilledNumber === normalizeAccountNumber(accountUpdateEvent.detail.oldKhateNumber)) {
          const nextSearchParams = new URLSearchParams(searchParams);
          nextSearchParams.set('accountNumber', normalizeAccountNumber(accountUpdateEvent.detail.newKhateNumber));
          setSearchParams(nextSearchParams, { replace: true });
          prefilledAccountAppliedRef.current = false;
        }
      }

      if (selectedSchool) {
        loadData();
      }
    };
    
    window.addEventListener('accountNameUpdated', handleAccountUpdate);
    window.addEventListener('accountUpdated', handleAccountUpdate);
    
    return () => {
      window.removeEventListener('accountNameUpdated', handleAccountUpdate);
      window.removeEventListener('accountUpdated', handleAccountUpdate);
    };
  }, [selectedSchool, searchParams, setSearchParams]);

  useEffect(() => {
    if (!prefilledAccountNumber || prefilledAccountAppliedRef.current) {
      return;
    }

    const accountName = accounts[normalizeAccountNumber(prefilledAccountNumber)];
    if (!accountName) {
      return;
    }

    const detailsWithName = `${accountName}\n`;

    setJamaFormData(prev => ({
      ...prev,
      accountNumber: prefilledAccountNumber,
      details: prev.details || detailsWithName
    }));

    setNaveFormData(prev => ({
      ...prev,
      accountNumber: prefilledAccountNumber,
      details: prev.details || detailsWithName
    }));

    prefilledAccountAppliedRef.current = true;
  }, [prefilledAccountNumber, accounts]);

  const loadData = async () => {
    if (!selectedSchool) return;
    try {
      setError(null);
      
      // Load accounts
      const accountsData = await accountsFirebase.getAll(selectedSchool.id);
      const accountMap: { [key: string]: string } = {};
      accountsData.forEach((acc) => {
        accountMap[normalizeAccountNumber(acc.khateNumber)] = acc.name;
      });
      setAccounts(accountMap);
      
      // Load entries
      const entriesData = await entriesFirebase.getAll(selectedSchool.id);
      setEntries(entriesData);
    } catch (err) {
      setError(handleFirebaseError(err));
      console.error('Error loading data:', err);
    }
  };

  // Format amount to ensure .00 format
  const formatAmountInput = (value: string) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toFixed(2);
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
      return;
    }
    
    if (!selectedSchool) return;
    if (newAccountName.trim() && newAccountNumber.trim()) {
      try {
        await accountsFirebase.create(selectedSchool.id, {
          khateNumber: newAccountNumber.trim(),
          name: newAccountName.trim()
        });
        
        setNewAccountName('');
        setNewAccountNumber('');
        setShowAddAccountForm(false);
        loadData(); // Reload data
      } catch (err) {
        const errorMessage = handleFirebaseError(err);
        if (errorMessage.includes('already exists')) {
          alert('या खाते नंबरचे खाते आधीच अस्तित्वात आहे!');
        } else {
          alert('खाते जोडताना त्रुटी: ' + errorMessage);
        }
      }
    }
  };

  const handleJamaInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Auto-fill details when account number changes
    if (name === 'accountNumber') {
      const accountName = accounts[normalizeAccountNumber(value)];
      setJamaFormData(prev => ({
        ...prev,
        [name]: value,
        details: accountName ? `${accountName}\n` : ''
      }));
    } else if (name === 'amount') {
      // Handle amount formatting on blur
      setJamaFormData(prev => ({
        ...prev,
        [name]: value
      }));
    } else {
      setJamaFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleNaveInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Auto-fill details when account number changes
    if (name === 'accountNumber') {
      const accountName = accounts[normalizeAccountNumber(value)];
      setNaveFormData(prev => ({
        ...prev,
        [name]: value,
        details: accountName ? `${accountName}\n` : ''
      }));
    } else if (name === 'amount') {
      // Handle amount formatting on blur
      setNaveFormData(prev => ({
        ...prev,
        [name]: value
      }));
    } else {
      setNaveFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleAmountBlur = (formType: 'jama' | 'nave', value: string) => {
    if (value && !isNaN(parseFloat(value))) {
      const formattedAmount = formatAmountInput(value);
      if (formType === 'jama') {
        setJamaFormData(prev => ({ ...prev, amount: formattedAmount }));
      } else {
        setNaveFormData(prev => ({ ...prev, amount: formattedAmount }));
      }
    }
  };

  const hasAnySideData = (formData: {
    accountNumber: string;
    receiptNumber: string;
    details: string;
    amount: string;
  }) => {
    return Boolean(
      formData.accountNumber.trim() ||
      formData.receiptNumber.trim() ||
      formData.details.trim() ||
      formData.amount.trim()
    );
  };

  const handleCombinedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
      return;
    }

    if (!selectedSchool) return;

    if (!sharedEntryDate) {
      alert('कृपया तारीख निवडा.');
      return;
    }

    const jamaAmount = jamaFormData.amount.trim() === '' ? 0 : parseFloat(jamaFormData.amount);
    const naveAmount = naveFormData.amount.trim() === '' ? 0 : parseFloat(naveFormData.amount);

    if (jamaFormData.amount.trim() !== '' && isNaN(jamaAmount)) {
      alert('कृपया जमा रक्कम योग्य टाका.');
      return;
    }

    if (naveFormData.amount.trim() !== '' && isNaN(naveAmount)) {
      alert('कृपया नावे रक्कम योग्य टाका.');
      return;
    }

    const shouldCreateJama = hasAnySideData(jamaFormData);
    const shouldCreateNave = hasAnySideData(naveFormData);

    try {
      const createOperations: Promise<Entry>[] = [];

      if (shouldCreateJama) {
        createOperations.push(
          entriesFirebase.create(selectedSchool.id, {
            date: sharedEntryDate,
            accountNumber: normalizeAccountNumber(jamaFormData.accountNumber),
            receiptNumber: jamaFormData.receiptNumber || '',
            details: jamaFormData.details || '',
            amount: jamaAmount,
            type: 'जमा'
          })
        );
      }

      if (shouldCreateNave) {
        createOperations.push(
          entriesFirebase.create(selectedSchool.id, {
            date: sharedEntryDate,
            accountNumber: normalizeAccountNumber(naveFormData.accountNumber),
            receiptNumber: naveFormData.receiptNumber || '',
            details: naveFormData.details || '',
            amount: naveAmount,
            type: 'नावे'
          })
        );
      }

      // If user keeps both sides empty, still allow a date-only row as requested.
      if (!shouldCreateJama && !shouldCreateNave) {
        createOperations.push(
          entriesFirebase.create(selectedSchool.id, {
            date: sharedEntryDate,
            accountNumber: '',
            receiptNumber: '',
            details: '',
            amount: 0,
            type: 'जमा'
          })
        );
      }

      await Promise.all(createOperations);
      setJamaFormData({
        date: '',
        accountNumber: '',
        receiptNumber: '',
        details: '',
        amount: ''
      });
      setNaveFormData({
        date: '',
        accountNumber: '',
        receiptNumber: '',
        details: '',
        amount: ''
      });
      loadData();
    } catch (err) {
      alert('नोंद जोडताना त्रुटी: ' + handleFirebaseError(err));
    }
  };

  const handleCombinedReset = () => {
    setSharedEntryDate('');
    setJamaFormData({
      date: '',
      accountNumber: '',
      receiptNumber: '',
      details: '',
      amount: ''
    });
    setNaveFormData({
      date: '',
      accountNumber: '',
      receiptNumber: '',
      details: '',
      amount: ''
    });
  };

  const handleEditEntry = (entry: Entry) => {
    setEditingEntry(entry);
    setEditFormData({
      date: entry.date,
      accountNumber: entry.accountNumber,
      receiptNumber: entry.receiptNumber || '',
      details: entry.details,
      amount: entry.amount.toString()
    });
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Auto-fill details when account number changes
    if (name === 'accountNumber') {
      const accountName = accounts[value];
      setEditFormData(prev => ({
        ...prev,
        [name]: value,
        details: accountName ? `${accountName}\n` : ''
      }));
    } else if (name === 'amount') {
      // Handle amount formatting on blur
      setEditFormData(prev => ({
        ...prev,
        [name]: value
      }));
    } else {
      setEditFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleEditAmountBlur = (value: string) => {
    if (value && !isNaN(parseFloat(value))) {
      const formattedAmount = formatAmountInput(value);
      setEditFormData(prev => ({ ...prev, amount: formattedAmount }));
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
      return;
    }
    
    if (!selectedSchool) return;
    if (editingEntry && editFormData.date) {
      try {
        const normalizedAccountNumber = normalizeAccountNumber(editFormData.accountNumber);
        const parsedAmount = editFormData.amount.trim() === '' ? 0 : parseFloat(editFormData.amount);

        if (editFormData.amount.trim() !== '' && isNaN(parsedAmount)) {
          alert('कृपया योग्य रक्कम टाका.');
          return;
        }

        await entriesFirebase.update(selectedSchool.id, editingEntry.id!, {
          date: editFormData.date,
          accountNumber: normalizedAccountNumber,
          receiptNumber: editFormData.receiptNumber || '',
          details: editFormData.details || '',
          amount: parsedAmount
        });
        
        setEditingEntry(null);
        setEditFormData({
          date: '',
          accountNumber: '',
          receiptNumber: '',
          details: '',
          amount: ''
        });
        
        loadData(); // Reload entries
      } catch (err) {
        alert('नोंद संपादित करताना त्रुटी: ' + handleFirebaseError(err));
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setEditFormData({
      date: '',
      accountNumber: '',
      receiptNumber: '',
      details: '',
      amount: ''
    });
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!isOnline) {
      alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
      return;
    }
    
    if (!selectedSchool) return;
    if (confirm('आपण हि नोंद काढू इच्छिता?.')) {
      try {
        await entriesFirebase.delete(selectedSchool.id, entryId);
        loadData(); // Reload entries
      } catch (err) {
        alert('नोंद हटवताना त्रुटी: ' + handleFirebaseError(err));
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportToExcel = () => {
    if (entries.length === 0) {
      alert('निर्यात करण्यासाठी कोणत्याही नोंदी उपलब्ध नाहीत!');
      return;
    }

    // Sort entries by date only
    const sortedEntries = [...entries].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });
    
    // Group entries by date
    const entriesByDate = sortedEntries.reduce((acc, entry) => {
      const date = entry.date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(entry);
      return acc;
    }, {} as { [key: string]: Entry[] });

    // Prepare data for Excel - Start directly with data entries
    const excelData: any[] = [];

    Object.entries(entriesByDate).forEach(([, dateEntries]) => {
      const jamaEntriesForDate = dateEntries.filter(e => e.type === 'जमा');
      const naveEntriesForDate = dateEntries.filter(e => e.type === 'नावे');
      const maxEntries = Math.max(jamaEntriesForDate.length, naveEntriesForDate.length);
      
      // Add entry rows for this date
      for (let i = 0; i < maxEntries; i++) {
        const jamaEntry = jamaEntriesForDate[i];
        const naveEntry = naveEntriesForDate[i];
        
        excelData.push({
          'तारीख': jamaEntry ? formatDate(jamaEntry.date) : '',
          'खाते नं.': jamaEntry ? jamaEntry.accountNumber : '',
          'पावती नं.': jamaEntry ? (jamaEntry.receiptNumber || '') : '',
          'जमेचा तपशील': jamaEntry ? (() => {
            const found = Object.values(accounts).find(name => jamaEntry.details.startsWith(name));
            if (found) {
              let rest = jamaEntry.details.slice(found.length).replace(/^[:\s]+/, '');
              return found + ':\n' + rest;
            }
            return jamaEntry.details;
          })() : '',
          'रक्कम': shouldShowAmount(jamaEntry) ? jamaEntry!.amount.toFixed(2) : '',
          'तारीख ': naveEntry ? formatDate(naveEntry.date) : '',
          'खाते नं. ': naveEntry ? naveEntry.accountNumber : '',
          'पावती नं. ': naveEntry ? (naveEntry.receiptNumber || '') : '',
          'नावेचा तपशील': naveEntry ? (() => {
            const found = Object.values(accounts).find(name => naveEntry.details.startsWith(name));
            if (found) {
              let rest = naveEntry.details.slice(found.length).replace(/^[:\s]+/, '');
              return found + ':\n' + rest;
            }
            return naveEntry.details;
          })() : '',
          'रक्कम ': shouldShowAmount(naveEntry) ? naveEntry!.amount.toFixed(2) : ''
        });
      }
      
      // Add daily totals
      const dailyJamaTotal = jamaEntriesForDate.reduce((sum, entry) => sum + (hasEntryAmount(entry.amount) ? entry.amount : 0), 0);
      const dailyNaveTotal = naveEntriesForDate.reduce((sum, entry) => sum + (hasEntryAmount(entry.amount) ? entry.amount : 0), 0);
      
      excelData.push({
        'तारीख': '',
        'खाते नं.': '',
        'पावती नं.': '',
        'जमेचा तपशील': 'एकूण:',
        'रक्कम': dailyJamaTotal.toFixed(2),
        'तारीख ': '',
        'खाते नं. ': '',
        'पावती नं. ': '',
        'नावेचा तपशील': 'एकूण:',
        'रक्कम ': dailyNaveTotal.toFixed(2)
      });

      // Add balance row
      const dailyBalance = dailyJamaTotal - dailyNaveTotal;
      excelData.push({
        'तारीख': '',
        'खाते नं.': '',
        'पावती नं.': '',
        'जमेचा तपशील': '',
        'रक्कम': '',
        'तारीख ': '',
        'खाते नं. ': '',
        'पावती नं. ': '',
        'नावेचा तपशील': 'शिल्लक:',
        'रक्कम ': `${Math.abs(dailyBalance).toFixed(2)}`
      });

      // Removed extra blank separator row between dates
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'किर्दवही नोंदी');

    // Color details cells red if they start with an account name
    const detailsCols = ['D', 'I'];
    Object.keys(ws).forEach(cell => {
      if (detailsCols.some(col => cell.startsWith(col))) {
        const v = ws[cell].v;
        if (typeof v === 'string' && Object.values(accounts).some(name => v.startsWith(name))) {
          ws[cell].s = { font: { color: { rgb: 'FFDC2626' }, bold: true } };
        }
      }
    });

    // Generate Excel file and download
    XLSX.writeFile(wb, `किर्दवही_नोंदी_${formatDateForFilename(new Date())}.xlsx`);
  };

  // Sort entries by date only
  const sortedEntries = [...entries].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateA - dateB;
  });

  // Group entries by date and create daily totals
  const entriesByDate = sortedEntries.reduce((acc, entry) => {
    const date = entry.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(entry);
    return acc;
  }, {} as { [key: string]: Entry[] });

  // Delete all entries
  const handleDeleteAllEntries = async () => {
    if (!isOnline) {
      alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
      return;
    }
    if (!window.confirm('सर्व नोंदी कायमच्या काढून टाकायच्या आहेत का? ही क्रिया उलटवता येणार नाही!')) return;
    if (!selectedSchool) return;
    try {
      // Delete all entries in parallel
      await Promise.all(entries.map(entry => entriesFirebase.delete(selectedSchool.id, entry.id!)));
      loadData();
    } catch (err) {
      alert('सर्व नोंदी हटवताना त्रुटी: ' + handleFirebaseError(err));
    }
  };


  if (!selectedSchool) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-lg">
          <p className="text-gray-600 marathi-font mb-4">कृपया प्रथम शाळा निवडा</p>
          <Link
            to="/"
            className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg inline-block"
          >
            शाळा निवडा
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-lg">
          <p className="text-red-600 marathi-font mb-4">त्रुटी: {error}</p>
          <button
            onClick={loadData}
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
      {isAdmin && <AdminHeader title="नवीन नोंद" showStats={true} />}
      
      {/* Combined Header with School Building Background */}
      <div className="combined-header shadow-lg print:shadow-none">
        <div className="school-header-section entry-school-header marathi-font text-white">
          {selectedSchool?.name || 'टी झेड पवार माध्यमिक विद्यालय गोराणे  ता. बागलाण जि. नाशिक'}
        </div>

        {/* Main Header Section */}
        <div className="main-header-section print:hidden">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <Link 
                to="/home" 
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="english-font">खतावणी बघा</span>
              </Link>
              <div className="flex items-center gap-3">
                <BookOpen className="w-6 h-6" />
                <h1 className="text-xl md:text-2xl font-bold marathi-font">नवीन नोंद</h1>
              </div>
              <div className="text-right text-sm english-font">
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm english-font">
                    <div>Entry Page</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Offline Alert */}
      {!isOnline && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 text-center marathi-font print:hidden">
          <strong>इंटरनेट कनेक्शन नाही!</strong> तुम्ही फक्त डेटा पाहू शकता. संपादन करण्यासाठी इंटरनेट कनेक्शन आवश्यक आहे.
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6 max-w-7xl print:px-2 print:py-2">
        {/* Print-only Account Name Header */}
        <div className="hidden print:block text-center mb-4">
        </div>
        
        {/* Add Account Form */}
        {showAddAccountForm && isOnline && (
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
                    setShowAddAccountForm(false);
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

        {/* Entry Forms */}
        {isAdmin && (
          <form onSubmit={handleCombinedSubmit} className="bg-white rounded-lg page-shadow ledger-border p-4 mb-6 print:hidden">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-800 marathi-font mb-2">
                तारीख *
              </label>
              <input
                type="date"
                name="sharedEntryDate"
                value={sharedEntryDate}
                onChange={(e) => setSharedEntryDate(e.target.value)}
                required
                disabled={!isOnline}
                className={`w-full p-3 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                  !isOnline ? 'bg-gray-100 cursor-not-allowed' : ''
                }`}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* जमा Entry Section */}
              <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
                <div className="text-center mb-4">
                  <h2 className="text-xl font-bold text-green-800 marathi-font">जमा नोंद</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-green-800 marathi-font mb-1">
                      खाते नंबर
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="accountNumber"
                        value={jamaFormData.accountNumber}
                        onChange={handleJamaInputChange}
                        disabled={!isOnline}
                        placeholder="खाते नंबर"
                        className={`flex-1 p-2 text-sm border border-green-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500 marathi-font ${
                          !isOnline ? 'bg-gray-100 cursor-not-allowed' : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!isOnline) {
                            alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
                            return;
                          }
                          setShowAddAccountForm(true);
                        }}
                        disabled={!isOnline}
                        className={`p-2 rounded text-xs ${
                          isOnline
                            ? 'bg-blue-500 hover:bg-blue-600 text-white'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                        title="नवीन खाते जोडा"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    {jamaFormData.accountNumber && accounts[jamaFormData.accountNumber] && (
                      <p className="text-xs text-green-600 mt-1 marathi-font">
                        ✓ {accounts[jamaFormData.accountNumber]}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-green-800 marathi-font mb-1">
                      पावती नंबर
                    </label>
                    <input
                      type="text"
                      name="receiptNumber"
                      value={jamaFormData.receiptNumber}
                      onChange={handleJamaInputChange}
                      disabled={!isOnline}
                      placeholder="पावती नंबर"
                      className={`w-full p-2 text-sm border border-green-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500 marathi-font ${
                        !isOnline ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-green-800 marathi-font mb-1">
                      रक्कम
                    </label>
                    <input
                      type="number"
                      name="amount"
                      value={jamaFormData.amount}
                      onChange={handleJamaInputChange}
                      onBlur={(e) => handleAmountBlur('jama', e.target.value)}
                      disabled={!isOnline}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className={`w-full p-2 text-sm border border-green-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500 english-font ${
                        !isOnline ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-green-800 marathi-font mb-1">
                    तपशील
                  </label>
                  <textarea
                    name="details"
                    value={jamaFormData.details}
                    onChange={handleJamaInputChange}
                    disabled={!isOnline}
                    placeholder="तपशील लिहा..."
                    rows={4}
                    className={`w-full p-2 text-sm border border-green-300 rounded focus:ring-1 focus:ring-green-500 focus:border-green-500 marathi-font resize-vertical ${
                      !isOnline ? 'bg-gray-100 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>

              {/* नावे Entry Section */}
              <div className="bg-red-50 p-4 rounded-lg border-2 border-red-200">
                <div className="text-center mb-4">
                  <h2 className="text-xl font-bold text-red-800 marathi-font">नावे नोंद</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-red-800 marathi-font mb-1">
                      खाते नंबर
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="accountNumber"
                        value={naveFormData.accountNumber}
                        onChange={handleNaveInputChange}
                        disabled={!isOnline}
                        placeholder="खाते नंबर"
                        className={`flex-1 p-2 text-sm border border-red-300 rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 marathi-font ${
                          !isOnline ? 'bg-gray-100 cursor-not-allowed' : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!isOnline) {
                            alert('इंटरनेट कनेक्शन नाही! कृपया ऑनलाइन येऊन पुन्हा प्रयत्न करा.');
                            return;
                          }
                          setShowAddAccountForm(true);
                        }}
                        disabled={!isOnline}
                        className={`p-2 rounded text-xs ${
                          isOnline 
                            ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                        title="नवीन खाते जोडा"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    {naveFormData.accountNumber && accounts[naveFormData.accountNumber] && (
                      <p className="text-xs text-red-600 mt-1 marathi-font">
                        ✓ {accounts[naveFormData.accountNumber]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-red-800 marathi-font mb-1">
                      पावती नंबर
                    </label>
                    <input
                      type="text"
                      name="receiptNumber"
                      value={naveFormData.receiptNumber}
                      onChange={handleNaveInputChange}
                      disabled={!isOnline}
                      placeholder="पावती नंबर"
                      className={`w-full p-2 text-sm border border-red-300 rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 marathi-font ${
                        !isOnline ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-red-800 marathi-font mb-1">
                      रक्कम
                    </label>
                    <input
                      type="number"
                      name="amount"
                      value={naveFormData.amount}
                      onChange={handleNaveInputChange}
                      onBlur={(e) => handleAmountBlur('nave', e.target.value)}
                      disabled={!isOnline}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className={`w-full p-2 text-sm border border-red-300 rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 english-font ${
                        !isOnline ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                    />
                  </div>
                </div>
                
                <div className="mb-4">
                  <label className="block text-xs font-medium text-red-800 marathi-font mb-1">
                    तपशील
                  </label>
                  <textarea
                    name="details"
                    value={naveFormData.details}
                    onChange={handleNaveInputChange}
                    disabled={!isOnline}
                    placeholder="तपशील लिहा..."
                    rows={4}
                    className={`w-full p-2 text-sm border border-red-300 rounded focus:ring-1 focus:ring-red-500 focus:border-red-500 marathi-font resize-vertical ${
                      !isOnline ? 'bg-gray-100 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 justify-center mt-4">
              <button
                type="submit"
                disabled={!isOnline}
                className={`px-8 py-2 rounded font-medium english-font transition-colors flex items-center gap-2 text-sm ${
                  isOnline
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                Save Entry
              </button>
              <button
                type="button"
                onClick={handleCombinedReset}
                className="bg-gray-500 hover:bg-gray-600 text-white px-8 py-2 rounded font-medium english-font transition-colors flex items-center gap-2 text-sm"
              >
                <X className="w-4 h-4" />
                Reset Form
              </button>
            </div>
          </form>
        )}

        {/* Edit Entry Modal */}
        {editingEntry && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 print:hidden">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-lg">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-blue-800 marathi-font">
                    नोंद संपादित करा - {editingEntry.type}
                  </h2>
                  <button
                    onClick={handleCancelEdit}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveEdit} className={`p-6 ${
                editingEntry.type === 'जमा' ? 'bg-green-50' : 'bg-red-50'
              }`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 marathi-font ${
                      editingEntry.type === 'जमा' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      तारीख *
                    </label>
                    <input
                      type="date"
                      name="date"
                      value={editFormData.date}
                      onChange={handleEditInputChange}
                      required
                      disabled={!isOnline}
                      className={`w-full p-3 text-sm border rounded-lg focus:ring-2 focus:ring-opacity-50 ${
                        editingEntry.type === 'जमा' 
                          ? 'border-green-300 focus:ring-green-500 focus:border-green-500' 
                          : 'border-red-300 focus:ring-red-500 focus:border-red-500'
                      } ${!isOnline ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 marathi-font ${
                      editingEntry.type === 'जमा' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      खाते नंबर
                    </label>
                    <input
                      type="text"
                      name="accountNumber"
                      value={editFormData.accountNumber}
                      onChange={handleEditInputChange}
                      disabled={!isOnline}
                      placeholder="खाते नंबर"
                      className={`w-full p-3 text-sm border rounded-lg focus:ring-2 focus:ring-opacity-50 marathi-font ${
                        editingEntry.type === 'जमा' 
                          ? 'border-green-300 focus:ring-green-500 focus:border-green-500' 
                          : 'border-red-300 focus:ring-red-500 focus:border-red-500'
                      } ${!isOnline ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 marathi-font ${
                      editingEntry.type === 'जमा' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      पावती नंबर
                    </label>
                    <input
                      type="text"
                      name="receiptNumber"
                      value={editFormData.receiptNumber}
                      onChange={handleEditInputChange}
                      disabled={!isOnline}
                      placeholder="पावती नंबर"
                      className={`w-full p-3 text-sm border rounded-lg focus:ring-2 focus:ring-opacity-50 marathi-font ${
                        editingEntry.type === 'जमा' 
                          ? 'border-green-300 focus:ring-green-500 focus:border-green-500' 
                          : 'border-red-300 focus:ring-red-500 focus:border-red-500'
                      } ${!isOnline ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 marathi-font ${
                      editingEntry.type === 'जमा' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      रक्कम
                    </label>
                    <input
                      type="number"
                      name="amount"
                      value={editFormData.amount}
                      onChange={handleEditInputChange}
                      onBlur={(e) => handleEditAmountBlur(e.target.value)}
                      disabled={!isOnline}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className={`w-full p-3 text-sm border rounded-lg focus:ring-2 focus:ring-opacity-50 english-font ${
                        editingEntry.type === 'जमा' 
                          ? 'border-green-300 focus:ring-green-500 focus:border-green-500' 
                          : 'border-red-300 focus:ring-red-500 focus:border-red-500'
                      } ${!isOnline ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    />
                  </div>
                </div>
                
                <div className="mb-6">
                  <label className={`block text-sm font-medium mb-2 marathi-font ${
                    editingEntry.type === 'जमा' ? 'text-green-800' : 'text-red-800'
                  }`}>
                    तपशील
                  </label>
                  <textarea
                    name="details"
                    value={editFormData.details}
                    onChange={handleEditInputChange}
                    disabled={!isOnline}
                    placeholder="तपशील लिहा..."
                    rows={4}
                    className={`w-full p-3 text-sm border rounded-lg focus:ring-2 focus:ring-opacity-50 marathi-font resize-vertical ${
                      editingEntry.type === 'जमा' 
                        ? 'border-green-300 focus:ring-green-500 focus:border-green-500' 
                        : 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    } ${!isOnline ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                </div>
                
                <div className="flex flex-wrap gap-3 justify-end">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium english-font transition-colors flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!isOnline}
                    className={`px-6 py-3 rounded-lg font-medium english-font transition-colors flex items-center gap-2 ${
                      isOnline 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {entries.length > 0 && isAdmin && (
          <div className="text-center mb-4 print:hidden">
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={handleExportToExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-medium marathi-font transition-colors inline-flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                किर्द Excel
              </button>
              <button
                onClick={handlePrint}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium marathi-font transition-colors inline-flex items-center gap-2"
              >
                <Printer className="w-5 h-5" />
                किर्द Print
              </button>
            </div>
          </div>
        )}

        {/* Merged Entries Table with Daily Totals */}
        {entries.length > 0 && (
          <div className="bg-white rounded-lg page-shadow ledger-border p-4 print:shadow-none print:border-0 print:rounded-none print:p-1">
            <h3 className="text-lg font-bold text-amber-800 marathi-font mb-4 text-center print:text-base print:mb-2">
              किर्दवही नोंदी
            </h3>
            {isAdmin && (
              <div className="flex justify-end mb-2 print:hidden">
                <button
                  onClick={handleDeleteAllEntries}
                  disabled={!isOnline || entries.length === 0}
                  className={`delete-btn px-4 py-2 rounded text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors ${
                    (!isOnline || entries.length === 0) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Trash2 className="inline-block w-4 h-4 mr-1" />
                  सर्व नोंदी हटवा
                </button>
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm print:text-base table-fixed print:table-auto border border-black entry-table">
                <thead>
                  {/* Sub Headers */}
                  <tr className="bg-amber-500 text-white">
                    <th className="p-1 text-left marathi-font border border-black date-column text-center align-middle">तारीख</th>
                    <th className="p-1 text-left marathi-font border border-black account-column text-center align-middle">खाते नं.</th>
                    <th className="p-1 text-left marathi-font border border-black receipt-column text-center align-middle">पावती नं.</th>
                    <th className="p-1 text-left marathi-font border border-black details-column text-center align-middle">
                      <span className="print:hidden">जमेचा तपशील</span>
                      <span className="hidden print:inline">जमेचा तपशील</span>
                    </th>
                    <th className="p-1 text-right marathi-font border border-black amount-column text-center align-middle">रक्कम</th>
                    <th className="p-1 text-left marathi-font border border-black date-column text-center align-middle">तारीख</th>
                    <th className="p-1 text-left marathi-font border border-black account-column text-center align-middle">खाते नं.</th>
                    <th className="p-1 text-left marathi-font border border-black receipt-column text-center align-middle">पावती नं.</th>
                    <th className="p-1 text-left marathi-font border border-black details-column text-center align-middle">
                      <span className="print:hidden">नावेचा तपशील</span>
                      <span className="hidden print:inline">नावेचा तपशील</span>
                    </th>
                    <th className="p-1 text-right marathi-font border border-black amount-column text-center align-middle">रक्कम</th>
                  </tr>
                </thead>
                {Object.entries(entriesByDate).map(([date, dateEntries], dateIndex, dateArray) => {
                  // Create rows where जमा and नावे entries are displayed side by side
                  const jamaEntriesForDate = dateEntries.filter(e => e.type === 'जमा');
                  const naveEntriesForDate = dateEntries.filter(e => e.type === 'नावे');
                  const maxEntries = Math.max(jamaEntriesForDate.length, naveEntriesForDate.length);
                  
                  // Check if this is the last date group
                  const isLastDate = dateIndex === dateArray.length - 1;
                  
                  return (
                    <tbody key={date} className={`print-date-group ${!isLastDate ? 'print-page-break-after' : ''}`}>
                      {/* Add entry rows for this date */}
                      {Array.from({ length: maxEntries }, (_, i) => {
                        const jamaEntry = jamaEntriesForDate[i];
                        const naveEntry = naveEntriesForDate[i];
                        
                        return (
                          <tr key={`${date}-${i}`} className="hover:bg-amber-50 transition-colors border-b print:hover:bg-transparent print:bg-white print-page-break-inside-avoid">
                            {/* जमा side columns */}
                            <td className="p-1 english-font border border-black date-column text-center align-middle">
                              {jamaEntry ? formatDate(jamaEntry.date) : ''}
                            </td>
                            <td className="p-1 marathi-font font-medium border border-black account-column text-center align-middle">
                              {jamaEntry ? resolveCurrentAccountNumber(jamaEntry.accountNumber, jamaEntry.details, accounts) : ''}
                            </td>
                            <td className="p-1 marathi-font border border-black receipt-column text-center align-middle">
                              {jamaEntry ? (jamaEntry.receiptNumber || '') : ''}
                            </td>
                            <td className="p-1 marathi-font leading-relaxed border border-black details-column text-wrap">
                              {jamaEntry ? highlightAccountName(jamaEntry.details, accounts) : ''}
                              {jamaEntry && jamaEntry.id && isAdmin && (
                                <>
                                  <button
                                    onClick={() => handleEditEntry(jamaEntry)}
                                    disabled={!isOnline}
                                    className={`edit-btn ml-2 p-1 rounded text-xs print:hidden ${
                                      isOnline 
                                        ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                                    title="Edit Entry"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                                                   <button
                                     onClick={() => handleDeleteEntry(jamaEntry.id!)}
                                    disabled={!isOnline}
                                    className={`delete-btn ml-2 p-1 rounded text-xs print:hidden ${
                                      isOnline 
                                        ? 'bg-red-500 hover:bg-red-600 text-white' 
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                                    title="Delete Entry"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              {!jamaEntry && naveEntry && naveEntry.id && isAdmin && (
                                <>
                                  <button
                                    onClick={() => handleEditEntry(naveEntry)}
                                    disabled={!isOnline}
                                    className={`edit-btn ml-2 p-1 rounded text-xs print:hidden ${
                                      isOnline
                                        ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                                    title="Edit Entry"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteEntry(naveEntry.id!)}
                                    disabled={!isOnline}
                                    className={`delete-btn ml-2 p-1 rounded text-xs print:hidden ${
                                      isOnline
                                        ? 'bg-red-500 hover:bg-red-600 text-white'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                                    title="Delete Entry"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                            </td>
                            <td className="p-1 text-right font-medium english-font border border-black amount-column">
                              {shouldShowAmount(jamaEntry) ? renderAmountWithBreak(jamaEntry!.amount) : ''}
                            </td>
                            
                            {/* नावे side columns */}
                            <td className="p-1 english-font border border-black date-column text-center align-middle">
                              {naveEntry ? formatDate(naveEntry.date) : ''}
                            </td>
                            <td className="p-1 marathi-font font-medium border border-black account-column text-center align-middle">
                              {naveEntry ? resolveCurrentAccountNumber(naveEntry.accountNumber, naveEntry.details, accounts) : ''}
                            </td>
                            <td className="p-1 marathi-font border border-black receipt-column text-center align-middle">
                              {naveEntry ? (naveEntry.receiptNumber || '') : ''}
                            </td>
                            <td className="p-1 marathi-font leading-relaxed border border-black details-column text-wrap">
                              {naveEntry ? highlightAccountName(naveEntry.details, accounts) : ''}
                              {naveEntry && naveEntry.id && isAdmin && (
                                <>
                                  <button
                                    onClick={() => handleEditEntry(naveEntry)}
                                    disabled={!isOnline}
                                    className={`edit-btn ml-2 p-1 rounded text-xs print:hidden ${
                                      isOnline 
                                        ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                                    title="Edit Entry"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteEntry(naveEntry.id!)}
                                    disabled={!isOnline}
                                    className={`delete-btn ml-2 p-1 rounded text-xs print:hidden ${
                                      isOnline 
                                        ? 'bg-red-500 hover:bg-red-600 text-white' 
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                                    title="Delete Entry"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              {!naveEntry && jamaEntry && jamaEntry.id && isAdmin && (
                                <>
                                  <button
                                    onClick={() => handleEditEntry(jamaEntry)}
                                    disabled={!isOnline}
                                    className={`edit-btn ml-2 p-1 rounded text-xs print:hidden ${
                                      isOnline
                                        ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                                    title="Edit Entry"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteEntry(jamaEntry.id!)}
                                    disabled={!isOnline}
                                    className={`delete-btn ml-2 p-1 rounded text-xs print:hidden ${
                                      isOnline
                                        ? 'bg-red-500 hover:bg-red-600 text-white'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                                    title="Delete Entry"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                            </td>
                            <td className="p-1 text-right font-medium english-font border border-black amount-column">
                              {shouldShowAmount(naveEntry) ? renderAmountWithBreak(naveEntry!.amount) : ''}
                            </td>
                          </tr>
                        );
                      })}
                      
                      {/* Add daily total row */}
                      {(() => {
                        const dailyJamaTotal = jamaEntriesForDate.reduce((sum, entry) => sum + (hasEntryAmount(entry.amount) ? entry.amount : 0), 0);
                        const dailyNaveTotal = naveEntriesForDate.reduce((sum, entry) => sum + (hasEntryAmount(entry.amount) ? entry.amount : 0), 0);
                        
                        return (
                          <tr className="daily-total-row bg-blue-100 font-medium print:bg-gray-100 print-page-break-inside-avoid">
                            <td colSpan={4} className="p-2 text-right marathi-font border border-black">
                              एकूण:
                            </td>
                            <td className="p-2 text-right english-font border border-black">
                              {renderAmountWithBreak(dailyJamaTotal)}
                            </td>
                            <td colSpan={4} className="p-2 text-right marathi-font border border-black">
                              एकूण:
                            </td>
                            <td className="p-2 text-right english-font border border-black">
                              {renderAmountWithBreak(dailyNaveTotal)}
                            </td>
                          </tr>
                        );
                      })()}

                      {/* Add शिल्लक row after each date */}
                      {(() => {
                        const dailyJamaTotal = jamaEntriesForDate.reduce((sum, entry) => sum + (hasEntryAmount(entry.amount) ? entry.amount : 0), 0);
                        const dailyNaveTotal = naveEntriesForDate.reduce((sum, entry) => sum + (hasEntryAmount(entry.amount) ? entry.amount : 0), 0);
                        const dailyBalance = dailyJamaTotal - dailyNaveTotal;
                        
                        return (
                          <tr className="balance-row bg-green-100 font-bold print:bg-gray-200 print-page-break-inside-avoid">
                            <td colSpan={9} className="p-2 text-right marathi-font border border-black">
                              शिल्लक:
                            </td>
                            <td className="p-2 text-right english-font border border-black">
                              {renderAmountWithBreak(Math.abs(dailyBalance))}
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  );
                })}
              </table>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex justify-center print:hidden">
          <Link 
            to="/" 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium english-font transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to खतावणी अनुक्रमणिका
          </Link>
        </div>
      </div>
    </div>
  );
};

export default EntryPage;