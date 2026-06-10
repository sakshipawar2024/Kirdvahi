import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import AdminHeader from './AdminHeader';
import { accountsFirebase, entriesFirebase, Account, Entry, handleFirebaseError } from '../services/firebaseService';
import { formatDateForFilename } from '../utils/dateUtils';
import { normalizeAccountNumber, resolveCurrentAccountNumber } from '../utils/accountUtils';

type AccountSummaryRow = {
  khateNumber: string;
  name: string;
  totalJama: number;
  totalNave: number;
};

const AccountSummaryPage: React.FC = () => {
  const { selectedSchool } = useSchool();
  const { isAdmin } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSchool) {
      loadData();
    } else {
      setError('कृपया प्रथम शाळा निवडा.');
      setLoading(false);
    }
  }, [selectedSchool]);

  const loadData = async () => {
    if (!selectedSchool) return;

    try {
      setLoading(true);
      setError(null);

      const [accountsData, entriesData] = await Promise.all([
        accountsFirebase.getAll(selectedSchool.id),
        entriesFirebase.getAll(selectedSchool.id)
      ]);

      setAccounts(accountsData);
      setEntries(entriesData);
    } catch (err) {
      setError(handleFirebaseError(err));
      console.error('Error loading account summary data:', err);
    } finally {
      setLoading(false);
    }
  };

  const summaryRows = useMemo<AccountSummaryRow[]>(() => {
    const accountMap: Record<string, string> = {};
    accounts.forEach((account) => {
      accountMap[normalizeAccountNumber(account.khateNumber)] = account.name;
    });

    const summaryMap = new Map<string, AccountSummaryRow>();

    accounts.forEach((account) => {
      const khateNumber = normalizeAccountNumber(account.khateNumber);
      summaryMap.set(khateNumber, {
        khateNumber,
        name: account.name,
        totalJama: 0,
        totalNave: 0
      });
    });

    entries.forEach((entry) => {
      const khateNumber = resolveCurrentAccountNumber(entry.accountNumber, entry.details, accountMap);
      const normalizedKhateNumber = normalizeAccountNumber(khateNumber);

      if (!normalizedKhateNumber) {
        return;
      }

      const existingRow = summaryMap.get(normalizedKhateNumber) || {
        khateNumber: normalizedKhateNumber,
        name: accountMap[normalizedKhateNumber] || `खाते नंबर ${normalizedKhateNumber}`,
        totalJama: 0,
        totalNave: 0
      };

      if (entry.type === 'जमा') {
        existingRow.totalJama += entry.amount || 0;
      } else {
        existingRow.totalNave += entry.amount || 0;
      }

      summaryMap.set(normalizedKhateNumber, existingRow);
    });

    return Array.from(summaryMap.values()).sort((left, right) => {
      const leftNumber = Number(left.khateNumber);
      const rightNumber = Number(right.khateNumber);

      if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber) && leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }

      return left.khateNumber.localeCompare(right.khateNumber, 'en', { numeric: true, sensitivity: 'base' });
    });
  }, [accounts, entries]);

  const totals = useMemo(() => {
    return summaryRows.reduce(
      (accumulator, row) => {
        accumulator.totalJama += row.totalJama;
        accumulator.totalNave += row.totalNave;
        return accumulator;
      },
      { totalJama: 0, totalNave: 0 }
    );
  }, [summaryRows]);

  const handleExportToExcel = () => {
    if (summaryRows.length === 0) {
      alert('निर्यात करण्यासाठी कोणताही summary data उपलब्ध नाही!');
      return;
    }

    const excelData = summaryRows.map((row) => ({
      'खाते नं.': row.khateNumber,
      'नाव': row.name,
      'एकूण जमा': row.totalJama.toFixed(2),
      'एकूण नावे': row.totalNave.toFixed(2)
    }));

    excelData.push({
      'खाते नं.': '',
      'नाव': 'एकूण:',
      'एकूण जमा': totals.totalJama.toFixed(2),
      'एकूण नावे': totals.totalNave.toFixed(2)
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'एकूण जमा नावे');
    XLSX.writeFile(workbook, `एकूण_जमा_नावे_${formatDateForFilename(new Date())}.xlsx`);
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
      {isAdmin && <AdminHeader title="एकूण जमा/नावे" showStats={false} />}

      <div className="combined-header shadow-lg print:shadow-none">
        <div className="school-header-section marathi-font text-amber-700 hidden print:block">
          {selectedSchool?.name || 'टी झेड पवार माध्यमिक विद्यालय गोराणे  ता. बागलाण जि. नाशिक'}
        </div>

        <div className="main-header-section print:hidden">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <Link
                to="/admin/accounts"
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors text-white"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="marathi-font">खतावणी अनुक्रमणिका</span>
              </Link>
              <div className="flex items-center gap-3 text-white">
                <BarChart3 className="w-6 h-6" />
                <h1 className="text-xl md:text-2xl font-bold marathi-font">एकूण जमा/नावे</h1>
              </div>
              <div className="text-right text-sm english-font text-white">
                <div>Account Summary</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-7xl print:px-2 print:py-2">
        <div className="bg-white rounded-lg page-shadow ledger-border p-4 md:p-6 print:shadow-none print:border-0 print:rounded-none print:p-1">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 print:hidden">
            <div>
              <h2 className="text-2xl font-bold text-amber-800 marathi-font">एकूण जमा/नावे</h2>
              <p className="text-sm text-gray-600 english-font">प्रत्येक खात्याचे जमा आणि नावे यांचे एकत्रित मूल्य</p>
            </div>
            <button
              onClick={handleExportToExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-lg font-medium marathi-font transition-colors inline-flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Excel निर्यात
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-black print:text-[10px]">
              <thead>
                <tr className="bg-amber-500 text-white">
                  <th className="p-2 border border-black text-center marathi-font">खाते नं</th>
                  <th className="p-2 border border-black text-center marathi-font">नाव</th>
                  <th className="p-2 border border-black text-center marathi-font">एकूण जमा</th>
                  <th className="p-2 border border-black text-center marathi-font">एकूण नावे</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-gray-500 marathi-font">
                      माहिती लोड होत आहे...
                    </td>
                  </tr>
                ) : summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-gray-500 marathi-font">
                      कोणत्याही खात्यासाठी नोंदी उपलब्ध नाहीत.
                    </td>
                  </tr>
                ) : (
                  <>
                    {summaryRows.map((row) => (
                      <tr key={row.khateNumber} className="odd:bg-amber-50 even:bg-white">
                        <td className="p-2 border border-black text-center english-font font-medium">{row.khateNumber}</td>
                        <td className="p-2 border border-black marathi-font">{row.name}</td>
                        <td className="p-2 border border-black text-right english-font">{row.totalJama.toFixed(2)}</td>
                        <td className="p-2 border border-black text-right english-font">{row.totalNave.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="bg-blue-100 font-bold">
                      <td className="p-2 border border-black text-center marathi-font" colSpan={2}>
                        एकूण
                      </td>
                      <td className="p-2 border border-black text-right english-font">{totals.totalJama.toFixed(2)}</td>
                      <td className="p-2 border border-black text-right english-font">{totals.totalNave.toFixed(2)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSummaryPage;