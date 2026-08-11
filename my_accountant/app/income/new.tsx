import { IncomeForm } from '@/components/forms/income-form';
import { Screen } from '@/components/ui/screen';

export default function NewIncomeScreen() {
  return (
    <Screen title="Record income" subtitle="It is split the moment you save it" back>
      <IncomeForm />
    </Screen>
  );
}
