import { NameListScreen } from '@/components/forms/name-list';
import {
  createIncomeSource,
  deleteIncomeSource,
  listIncomeSources,
  updateIncomeSource,
} from '@/lib/endpoints';

export default function SourcesScreen() {
  return (
    <NameListScreen
      title="Income sources"
      subtitle="Where your money comes from"
      noun="source"
      icon="briefcase-outline"
      emptyBody="Name the places your income comes from and you can filter and report on each one."
      deleteNote="Income already recorded keeps its source name in your reports. Only the list changes."
      list={listIncomeSources}
      create={createIncomeSource}
      rename={updateIncomeSource}
      remove={deleteIncomeSource}
    />
  );
}
