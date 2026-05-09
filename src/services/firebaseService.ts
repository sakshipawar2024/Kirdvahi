// Firebase Firestore service for Marathi Ledger Book
import { 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  writeBatch,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { accountNumbersMatch, normalizeAccountNumber, replaceAccountNamePrefix } from '../utils/accountUtils';

export interface Account {
  id?: string;
  khateNumber: string;
  name: string;
  createdAt?: Timestamp | Date;
}

export interface Entry {
  id?: string;
  date: string;
  accountNumber: string;
  receiptNumber?: string;
  details: string;
  amount: number;
  type: 'जमा' | 'नावे';
  createdAt?: Timestamp | Date;
}

// Ensure Firestore is initialized
const ensureDb = () => {
  if (!db) {
    throw new Error('Firebase is not initialized. कृपया .env मध्ये Firebase सेटिंग तपासा.');
  }
  return db;
};

// Helper functions to get school-specific collections
const getAccountsCollection = (schoolId: string) => 
  collection(ensureDb(), 'schools', schoolId, 'accounts');
const getEntriesCollection = (schoolId: string) => 
  collection(ensureDb(), 'schools', schoolId, 'entries');

// Account operations
export const accountsFirebase = {
  // Get all accounts
  getAll: async (schoolId: string): Promise<Account[]> => {
    try {
      const q = query(getAccountsCollection(schoolId), orderBy('khateNumber'));
      const querySnapshot = await getDocs(q);
      
      const accounts: Account[] = [];
      querySnapshot.forEach((doc) => {
        accounts.push({
          id: doc.id,
          ...doc.data()
        } as Account);
      });
      
      return accounts;
    } catch (error) {
      console.error('Error fetching accounts:', error);
      throw error;
    }
  },

  // Create new account
  create: async (schoolId: string, account: Omit<Account, 'id' | 'createdAt'>): Promise<Account> => {
    try {
      const normalizedAccountNumber = normalizeAccountNumber(account.khateNumber);

      // Check if account number already exists
      const q = query(
        getAccountsCollection(schoolId), 
        where('khateNumber', '==', normalizedAccountNumber)
      );
      const existingAccounts = await getDocs(q);
      
      if (!existingAccounts.empty) {
        throw new Error('Account number already exists');
      }

      const docRef = await addDoc(getAccountsCollection(schoolId), {
        ...account,
        khateNumber: normalizedAccountNumber,
        createdAt: serverTimestamp()
      });

      return {
        id: docRef.id,
        ...account,
        createdAt: new Date()
      };
    } catch (error) {
      console.error('Error creating account:', error);
      throw error;
    }
  },

  // Update account
  update: async (schoolId: string, id: string, updates: Partial<Account>): Promise<void> => {
    try {
      const dbInstance = ensureDb();
      const accountRef = doc(dbInstance, 'schools', schoolId, 'accounts', id);
      const accountSnapshot = await getDoc(accountRef);

      if (!accountSnapshot.exists()) {
        throw new Error('Account not found');
      }

      const currentAccount = accountSnapshot.data() as Account;
      const updatedKhateNumber = updates.khateNumber ? normalizeAccountNumber(updates.khateNumber) : currentAccount.khateNumber;
      const updatedName = updates.name ? updates.name.trim() : currentAccount.name;
      const accountNumberChanged = !accountNumbersMatch(currentAccount.khateNumber, updatedKhateNumber);
      const accountNameChanged = updatedName !== currentAccount.name;

      const batch = writeBatch(dbInstance);
      batch.update(accountRef, {
        ...updates,
        khateNumber: updatedKhateNumber,
        name: updatedName
      });

      if (accountNumberChanged || accountNameChanged) {
        const entriesSnapshot = await getDocs(getEntriesCollection(schoolId));

        entriesSnapshot.forEach((entryDoc) => {
          const currentEntry = entryDoc.data() as Entry;
          if (!accountNumbersMatch(currentEntry.accountNumber, currentAccount.khateNumber)) {
            return;
          }

          const entryUpdates: Partial<Entry> = {};

          if (accountNumberChanged) {
            entryUpdates.accountNumber = updatedKhateNumber;
          }

          if (accountNameChanged) {
            entryUpdates.details = replaceAccountNamePrefix(currentEntry.details, currentAccount.name, updatedName);
          }

          if (Object.keys(entryUpdates).length > 0) {
            batch.update(doc(dbInstance, 'schools', schoolId, 'entries', entryDoc.id), entryUpdates);
          }
        });
      }

      await batch.commit();
    } catch (error) {
      console.error('Error updating account:', error);
      throw error;
    }
  },

  // Delete account
  delete: async (schoolId: string, id: string, khateNumber: string): Promise<void> => {
    try {
      // First delete all related entries
      const entriesSnapshot = await getDocs(getEntriesCollection(schoolId));
      
      // Delete all related entries
      const deletePromises = entriesSnapshot.docs
        .filter(entryDoc => accountNumbersMatch((entryDoc.data() as Entry).accountNumber, khateNumber))
        .map(entryDoc => deleteDoc(doc(ensureDb(), 'schools', schoolId, 'entries', entryDoc.id)));
      await Promise.all(deletePromises);

      // Then delete the account
      await deleteDoc(doc(ensureDb(), 'schools', schoolId, 'accounts', id));
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  }
};

// Entry operations
export const entriesFirebase = {
  // Get all entries - simplified query to avoid composite index requirement
  getAll: async (schoolId: string): Promise<Entry[]> => {
    try {
      // Use single field ordering to avoid composite index requirement
      const q = query(getEntriesCollection(schoolId), orderBy('date'));
      const querySnapshot = await getDocs(q);
      
      const entries: Entry[] = [];
      querySnapshot.forEach((doc) => {
        entries.push({
          id: doc.id,
          ...doc.data()
        } as Entry);
      });
      
      // Sort by createdAt in memory for entries with the same date
      entries.sort((a, b) => {
        const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateComparison !== 0) return dateComparison;
        
        // If dates are the same, sort by createdAt
        const aCreatedAt = a.createdAt instanceof Date ? a.createdAt : 
                          a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
        const bCreatedAt = b.createdAt instanceof Date ? b.createdAt : 
                          b.createdAt?.toDate ? b.createdAt.toDate() : new Date();
        
        return aCreatedAt.getTime() - bCreatedAt.getTime();
      });
      
      return entries;
    } catch (error) {
      console.error('Error fetching entries:', error);
      throw error;
    }
  },

  // Get entries by account - simplified query
  getByAccount: async (schoolId: string, accountNumber: string): Promise<Entry[]> => {
    try {
      const querySnapshot = await getDocs(getEntriesCollection(schoolId));
      
      const entries: Entry[] = [];
      querySnapshot.forEach((doc) => {
        const entry = {
          id: doc.id,
          ...doc.data()
        } as Entry;

        if (accountNumbersMatch(entry.accountNumber, accountNumber)) {
          entries.push(entry);
        }
      });
      
      // Sort by date first, then by createdAt in memory
      entries.sort((a, b) => {
        const dateComparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateComparison !== 0) return dateComparison;
        
        // If dates are the same, sort by createdAt
        const aCreatedAt = a.createdAt instanceof Date ? a.createdAt : 
                          a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
        const bCreatedAt = b.createdAt instanceof Date ? b.createdAt : 
                          b.createdAt?.toDate ? b.createdAt.toDate() : new Date();
        
        return aCreatedAt.getTime() - bCreatedAt.getTime();
      });
      
      return entries;
    } catch (error) {
      console.error('Error fetching entries by account:', error);
      throw error;
    }
  },

  // Create new entry
  create: async (schoolId: string, entry: Omit<Entry, 'id' | 'createdAt'>): Promise<Entry> => {
    try {
      const normalizedAccountNumber = normalizeAccountNumber(entry.accountNumber);

      // Verify account exists only when account number is provided
      if (normalizedAccountNumber) {
        const accountsQuery = query(
          getAccountsCollection(schoolId),
          where('khateNumber', '==', normalizedAccountNumber)
        );
        const accountsSnapshot = await getDocs(accountsQuery);

        if (accountsSnapshot.empty) {
          throw new Error('Account not found');
        }
      }

      const docRef = await addDoc(getEntriesCollection(schoolId), {
        ...entry,
        accountNumber: normalizedAccountNumber,
        createdAt: serverTimestamp()
      });

      return {
        id: docRef.id,
        ...entry,
        createdAt: new Date()
      };
    } catch (error) {
      console.error('Error creating entry:', error);
      throw error;
    }
  },

  // Update entry
  update: async (schoolId: string, id: string, updates: Partial<Entry>): Promise<void> => {
    try {
      const entryRef = doc(ensureDb(), 'schools', schoolId, 'entries', id);
      await updateDoc(entryRef, updates);
    } catch (error) {
      console.error('Error updating entry:', error);
      throw error;
    }
  },

  // Delete entry
  delete: async (schoolId: string, id: string): Promise<void> => {
    try {
      await deleteDoc(doc(ensureDb(), 'schools', schoolId, 'entries', id));
    } catch (error) {
      console.error('Error deleting entry:', error);
      throw error;
    }
  }
};

// Error handling helper
export const handleFirebaseError = (error: any): string => {
  if (error.code) {
    switch (error.code) {
      case 'permission-denied':
        return 'Permission denied. Please check your Firebase security rules.';
      case 'unavailable':
        return 'Firebase service is currently unavailable. Please try again later.';
      case 'failed-precondition':
        return 'Operation failed due to a precondition. Please check your data.';
      default:
        return `Firebase error: ${error.message}`;
    }
  } else if (error.message) {
    return error.message;
  } else {
    return 'An unknown error occurred';
  }
};