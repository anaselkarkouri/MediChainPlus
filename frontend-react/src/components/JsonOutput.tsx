interface Props {
  data: unknown;
  isError?: boolean;
}

export function JsonOutput({ data, isError }: Props) {
  if (data === null || data === undefined) return null;
  return (
    <pre
      className={`mt-3 p-3 rounded-lg text-xs font-mono overflow-auto max-h-64 border ${
        isError
          ? "bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300"
          : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-300"
      }`}
    >
      {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
}
