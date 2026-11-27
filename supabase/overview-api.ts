import { getSafeErrorMessage } from "@/supabase/errors";
import { getSupabaseClient } from "@/supabase/client";

export type OverviewMetric = {
  label: string;
  table: string;
  count: number | null;
  error: string | null;
};

const overviewTables = [
  { label: "People", table: "employees" },
  { label: "Documents", table: "documents" },
  { label: "Notifications", table: "notifications" },
] as const;

export async function loadOverview(): Promise<OverviewMetric[]> {
  const client = getSupabaseClient();
  return Promise.all(
    overviewTables.map(async ({ label, table }) => {
      try {
        const { count, error } = await client
          .from(table)
          .select("*", { count: "exact", head: true });

        if (error) {
          return {
            label,
            table,
            count: null,
            error: getSafeErrorMessage(error),
          };
        }

        return { label, table, count: count ?? 0, error: null };
      } catch (error) {
        return {
          label,
          table,
          count: null,
          error: getSafeErrorMessage(error),
        };
      }
    }),
  );
}
