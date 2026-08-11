import { ExpenseForm } from '@/components/forms/expense-form';
import { Screen } from '@/components/ui/screen';

export default function NewExpenseScreen() {
  return (
    <Screen title="Record expense" subtitle="Money spent freely, outside the split" back>
      <ExpenseForm />
    </Screen>
  );
}
