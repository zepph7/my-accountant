import { NameListScreen } from '@/components/forms/name-list';
import {
  createExpenseCategory,
  deleteExpenseCategory,
  listExpenseCategories,
  updateExpenseCategory,
} from '@/lib/endpoints';

export default function CategoriesScreen() {
  return (
    <NameListScreen
      title="Expense categories"
      subtitle="What the spending breakdown groups by"
      noun="category"
      icon="pricetag-outline"
      emptyBody="Group what you spend and the reports can tell you where it actually goes."
      deleteNote="Expenses already recorded keep their category in your reports. Only the list changes."
      list={listExpenseCategories}
      create={createExpenseCategory}
      rename={updateExpenseCategory}
      remove={deleteExpenseCategory}
    />
  );
}
