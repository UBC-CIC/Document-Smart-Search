import os

# This script is meant to be run on the terminal of your local machine.
# It is not a lambda function, it is a utility script to rename the requirements.txt file to requirements.in for the lambda functions.

# List of directories where requirements.txt might exist
dirs = [
    "text_generation",
    "docDetailViewFunction",
    "hybridSearchFunction",
    "similaritySearchFunction",
    "chartAnalyticsFunction",
    "relatedDocumentsFunction",
    "userFiltersFunction",
    "llmAnalysisFunction",
]

def rename_requirements_files(base_path, directory_list):
    """
    Renames 'requirements.txt' to 'requirements.in' in specified directories.

    Args:
        base_path (str): The base directory where the function directories are located.
        directory_list (list): A list of directory names to process.
    """
    print(f"Starting to process directories under: {os.path.abspath(base_path)}\n")

    for directory in directory_list:
        old_file_name = "requirements.txt"
        new_file_name = "requirements.in"

        # Construct the full path to the directory
        dir_path = os.path.join(base_path, directory)

        # Construct the full path for the old and new requirements files
        old_file_path = os.path.join(dir_path, old_file_name)
        new_file_path = os.path.join(dir_path, new_file_name)

        if os.path.exists(old_file_path):
            try:
                os.rename(old_file_path, new_file_path)
                print(f"Renamed '{old_file_name}' to '{new_file_name}' in '{directory}'")
            except OSError as e:
                print(f"Error renaming file in '{directory}': {e}")
        else:
            print(f"'{old_file_name}' not found in '{directory}', skipping.")
    
    print("\nFinished processing all directories.")

# Assuming the script is run from the parent directory containing all function folders
# If your function directories are nested deeper, adjust 'base_directory' accordingly.
# For example, if they are in 'lambda_functions/', set base_directory = 'lambda_functions'
base_directory = "." # Current directory

if __name__ == "__main__":
    rename_requirements_files(base_directory, dirs)

