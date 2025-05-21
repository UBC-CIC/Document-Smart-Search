import { Plus, Minus } from "lucide-react";

export default function ExpandableSection({ 
  title, 
  expanded, 
  onToggle, 
  children, 
  nested = false 
}) {
  return (
    <div className={`border-b dark:border-gray-700 ${nested ? "last:border-b-0" : ""}`}>
      <button
        className={`w-full p-4 flex justify-between items-center hover:bg-gray-200 dark:hover:bg-gray-700 ${
          nested 
            ? "bg-gray-50 dark:bg-gray-800 pl-8" 
            : "bg-gray-100 dark:bg-gray-800"
        }`}
        onClick={onToggle}
      >
        <span className="font-medium dark:text-white">{title}</span>
        {expanded ? (
          <Minus className="h-5 w-5 dark:text-white" />
        ) : (
          <Plus className="h-5 w-5 dark:text-white" />
        )}
      </button>
      
      {expanded && (
        <div className={`bg-white dark:bg-gray-800 dark:text-gray-300 ${
          nested ? "p-4 pl-8" : "p-4"
        }`}>
          {children}
        </div>
      )}
    </div>
  );
}
