import { useState, useEffect, useMemo } from "react";
import { filterOptions as defaultFilters } from "../data/defaultData";
import {
  fetchFilterOptions,
  performDocumentSearch,
} from "../services/documentSearchService";

export function useDocumentSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredResults, setFilteredResults] = useState([]);
  const [sortBy, setSortBy] = useState("recent"); // Default sort is recent (newest first)
  const [currentPage, setCurrentPage] = useState(1);
  const [resultsPerPage] = useState(5); // Number of results to show per page
  const [isLoading, setIsLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState(defaultFilters); // Use default filters initially
  const [hasSearched, setHasSearched] = useState(false);
  const [rawResults, setRawResults] = useState([]); // Store the raw results before sorting

  // Filter states
  const [yearFilters, setYearFilters] = useState({});
  const [topicFilters, setTopicFilters] = useState({});
  const [derivedTopicFilters, setDerivedTopicFilters] = useState({}); // Add new filter state for derived topics
  const [mandateFilters, setMandateFilters] = useState({});
  const [authorFilters, setAuthorFilters] = useState({});
  const [documentTypeFilters, setDocumentTypeFilters] = useState({}); // Add new filter state

  // Fetch filter options on component mount
  useEffect(() => {
    async function getFilterOptions() {
      setIsLoading(true);
      try {
        const options = await fetchFilterOptions();
        setFilterOptions(options);

        // Initialize filters
        setYearFilters(
          Object.fromEntries(options.years.map((y) => [y, false]))
        );
        setTopicFilters(
          Object.fromEntries(options.topics.map((t) => [t, false]))
        );
        setDerivedTopicFilters(
          Object.fromEntries(
            (options.derivedTopics || []).map((t) => [t, false])
          )
        );
        setMandateFilters(
          Object.fromEntries(options.mandates.map((m) => [m, false]))
        );
        setAuthorFilters(
          Object.fromEntries(options.authors.map((a) => [a, false]))
        );
        setDocumentTypeFilters(
          Object.fromEntries(
            (options.documentTypes || []).map((t) => [t, false])
          )
        );

        const savedFilters = sessionStorage.getItem("filters");
        if (savedFilters) {
          const parsed = JSON.parse(savedFilters);
          if (parsed.yearFilters) setYearFilters(parsed.yearFilters);
          if (parsed.topicFilters) setTopicFilters(parsed.topicFilters);
          if (parsed.derivedTopicFilters)
            setDerivedTopicFilters(parsed.derivedTopicFilters);
          if (parsed.mandateFilters) setMandateFilters(parsed.mandateFilters);
          if (parsed.authorFilters) setAuthorFilters(parsed.authorFilters);
          if (parsed.documentTypeFilters)
            setDocumentTypeFilters(parsed.documentTypeFilters);
        }
      } catch (error) {
        console.error("Error getting filter options:", error);
      } finally {
        setIsLoading(false);
      }
    }

    getFilterOptions();
  }, []);

  // Apply all filters and perform search
  const applyFilters = async () => {
    // Don't perform search if query is empty and no filters active
    if (
      !searchQuery.trim() &&
      !Object.values(yearFilters).some((val) => val) &&
      !Object.values(topicFilters).some((val) => val) &&
      !Object.values(derivedTopicFilters).some((val) => val) &&
      !Object.values(mandateFilters).some((val) => val) &&
      !Object.values(authorFilters).some((val) => val) &&
      !Object.values(documentTypeFilters).some((val) => val)
    ) {
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    try {
      const filters = {
        yearFilters,
        topicFilters,
        derivedTopicFilters,
        mandateFilters,
        authorFilters,
        documentTypeFilters,
      };

      // When fetching results, we don't need to pass the sortBy parameter to the backend
      const results = await performDocumentSearch(searchQuery, filters);
      setRawResults(results); // Store raw results

      // Apply sorting in the frontend
      const sortedResults = sortResults(results, sortBy);
      setFilteredResults(sortedResults);

      // Save search query and results in sessionStorage
      sessionStorage.setItem("searchQuery", searchQuery);
      sessionStorage.setItem("searchResults", JSON.stringify(sortedResults));
      sessionStorage.setItem("totalResults", results.length.toString()); // if you use total count
      sessionStorage.setItem("hasSearched", "true");
      sessionStorage.setItem(
        "filters",
        JSON.stringify({
          yearFilters,
          topicFilters,
          derivedTopicFilters,
          mandateFilters,
          authorFilters,
          documentTypeFilters,
        })
      );
    } catch (error) {
      console.error("Error applying filters:", error);
      setFilteredResults([]);
      setRawResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to sort results based on sortBy
  const sortResults = (results, sortOption) => {
    const resultsToSort = [...results]; // Create a copy to avoid mutating the original

    if (sortOption === "recent") {
      return resultsToSort.sort((a, b) => {
        const yearA = a.year || a.csasYear || 0;
        const yearB = b.year || b.csasYear || 0;
        return Number.parseInt(yearB) - Number.parseInt(yearA);
      });
    } else if (sortOption === "oldest") {
      return resultsToSort.sort((a, b) => {
        const yearA = a.year || a.csasYear || 0;
        const yearB = b.year || b.csasYear || 0;
        return Number.parseInt(yearA) - Number.parseInt(yearB);
      });
    } else if (sortOption === "a-z") {
      return resultsToSort.sort((a, b) => a.title.localeCompare(b.title));
    }

    return resultsToSort;
  };

  // Get paginated results based on current page
  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * resultsPerPage;
    const endIndex = startIndex + resultsPerPage;
    return filteredResults.slice(startIndex, endIndex);
  }, [filteredResults, currentPage, resultsPerPage]);

  // Calculate total pages
  const totalPages = useMemo(() => {
    return Math.ceil(filteredResults.length / resultsPerPage);
  }, [filteredResults, resultsPerPage]);

  // Reset to page 1 when search results change
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredResults.length]);

  // Reset all filters
  const resetFilters = () => {
    setYearFilters(
      Object.fromEntries(filterOptions.years.map((year) => [year, false]))
    );
    setTopicFilters(
      Object.fromEntries(filterOptions.topics.map((topic) => [topic, false]))
    );
    setDerivedTopicFilters(
      Object.fromEntries(
        (filterOptions.derivedTopics || []).map((topic) => [topic, false])
      )
    );
    setMandateFilters(
      Object.fromEntries(
        filterOptions.mandates.map((mandate) => [mandate, false])
      )
    );
    setAuthorFilters(
      Object.fromEntries(filterOptions.authors.map((author) => [author, false]))
    );
    setDocumentTypeFilters(
      Object.fromEntries(
        (filterOptions.documentTypes || []).map((type) => [type, false])
      )
    );
    setSearchQuery("");

    // Clear results
    setFilteredResults([]);
    setRawResults([]);
    setHasSearched(false);
  };

  // Update results when sort option changes (client-side sorting)
  useEffect(() => {
    if (hasSearched && rawResults.length > 0) {
      const sortedResults = sortResults(rawResults, sortBy);
      setFilteredResults(sortedResults);
    }
  }, [sortBy, rawResults]);

  return {
    searchQuery,
    setSearchQuery,
    filteredResults: paginatedResults, // Return only current page results
    setFilteredResults,
    sortBy,
    setSortBy,
    currentPage,
    setCurrentPage,
    yearFilters,
    setYearFilters,
    topicFilters,
    setTopicFilters,
    derivedTopicFilters,
    setDerivedTopicFilters,
    mandateFilters,
    setMandateFilters,
    authorFilters,
    setAuthorFilters,
    documentTypeFilters,
    setDocumentTypeFilters,
    resetFilters,
    applyFilters,
    totalResults: filteredResults.length, // Total, not just current page
    setHasSearched,
    totalPages,
    isLoading,
    hasSearched,
  };
}
