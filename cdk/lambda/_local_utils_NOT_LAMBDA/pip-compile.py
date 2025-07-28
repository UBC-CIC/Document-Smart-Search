import os
import subprocess

# This script is meant to be run on the terminal of your local machine.
# It is not a lambda function, it is a utility script to pip-compile the requirements.txt file for the lambda functions.
# It launch a shell command to compile the requirements.txt file for the lambda functions.

# List of directories where requirements.in files are expected
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

def run_pip_compile_for_dirs(base_path, directory_list):
    """
    Runs 'pip-compile' for 'requirements.in' in specified directories,
    outputting to 'requirements.txt'.

    Args:
        base_path (str): The base directory where the function directories are located.
        directory_list (list): A list of directory names to process.
    """
    print(f"Starting pip-compile for directories under: {os.path.abspath(base_path)}\n")
    print("Ensure 'pip-tools' is installed in your **base Conda environment**.")
    print("This script will attempt to use 'conda run -n base pip-compile'.\n")

    for directory in directory_list:
        input_file_name = "requirements.in"
        output_file_name = "requirements.txt"

        # Construct the full path to the directory
        dir_path = os.path.join(base_path, directory)

        # Construct the full path for the input and output requirements files
        input_file_path = os.path.join(dir_path, input_file_name)
        output_file_path = os.path.join(dir_path, output_file_name)

        if os.path.exists(input_file_path):
            print(f"Processing '{input_file_name}' in '{directory}'...")
            try:
                # Construct the pip-compile command using conda run
                # Assuming 'pip-tools' is installed in the 'base' conda environment.
                # If it's in a different conda env, change 'base' to that env's name.
                command = [
                    "conda", "run", "-n", "test-311", "pip-compile",
                    str(input_file_path),
                    "-o",
                    str(output_file_path)
                ]
                
                # Execute the command
                # capture_output=True to get stdout/stderr, text=True for string output
                result = subprocess.run(command, capture_output=True, text=True, check=True)
                
                print(f"Successfully compiled '{input_file_name}' to '{output_file_name}' in '{directory}'")
                if result.stdout:
                    print("--- stdout ---")
                    print(result.stdout)
                if result.stderr:
                    print("--- stderr ---")
                    print(result.stderr)

            except subprocess.CalledProcessError as e:
                print(f"Error compiling '{input_file_name}' in '{directory}':")
                print(f"Command failed with exit code {e.returncode}")
                print("--- stdout ---")
                print(e.stdout)
                print("--- stderr ---")
                print(e.stderr)
            except FileNotFoundError:
                print(f"Error: 'conda' or 'pip-compile' command not found. Please ensure Conda is in your PATH and 'pip-tools' is installed in your specified Conda environment.")
            except Exception as e:
                print(f"An unexpected error occurred while processing '{directory}': {e}")
        else:
            print(f"'{input_file_name}' not found in '{directory}', skipping.")
    
    print("\nFinished running pip-compile for all specified directories.")

# Assuming the script is run from the parent directory containing all function folders
base_directory = "." # Current directory

if __name__ == "__main__":
    run_pip_compile_for_dirs(base_directory, dirs)

