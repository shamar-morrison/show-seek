import { functions } from '@/src/firebase/config';
import { httpsCallable } from 'firebase/functions';

export interface DeleteAccountResult {
  success: true;
}

class AccountDeletionService {
  private readonly deleteAccountCallable = httpsCallable<void, DeleteAccountResult>(
    functions,
    'deleteAccount'
  );

  async deleteAccount(): Promise<DeleteAccountResult> {
    const result = await this.deleteAccountCallable();
    return result.data;
  }
}

export const accountDeletionService = new AccountDeletionService();
