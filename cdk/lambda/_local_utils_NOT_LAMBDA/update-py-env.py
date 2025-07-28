"""
This is not a lambda function, it is a utility script to update the requirements.txt file for the lambda functions.
It is meant to be run on the terminal of your local machine.
It launch a shell command to create a conda environment, install the packages, and then freeze the environment.
It then remove the conda environment as part of the final cleanup.
"""

import subprocess
from pathlib import Path
import os
from tqdm import tqdm

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

for dir_name in tqdm(dirs): # Renamed 'dir' to 'dir_name' to avoid shadowing built-in function
    print(f"\n--- Processing directory: {dir_name} ---")
    
    # Construct the full path to the directory
    full_path = Path(os.getcwd()) / dir_name

    # Ensure requirements.txt exists in the target directory
    requirements_file_name = "requirements.txt"
    requirements_path = full_path / requirements_file_name
    if not requirements_path.exists():
        print(f"Warning: '{requirements_file_name}' not found in {full_path}. Skipping directory.")
        continue

    # Construct the shell command.
    # - `set -e`: Ensures the script exits immediately if any command fails.
    # - `conda create -y`: Add -y for non-interactive creation.
    # - `conda run -n ...`: Executes commands within the specified conda environment.
    # - Removed `-y` from `pip install`.
    # - Removed `>> requirements.txt` to prevent file corruption.
    shell_command = f"""
    set -e
    echo "Creating conda environment 'lambda-docker-env-311'..."
    conda create -n lambda-docker-env-311 python=3.11 -y

    echo "Installing packages from {requirements_file_name}..."
    conda run -n lambda-docker-env-311 pip install -r {requirements_file_name}

    echo "Listing installed versions of packages from {requirements_file_name}:"

    # Define a list of packages that need prefix matching (e.g., psycopg, psycopg-binary)
    # Add other problematic packages here if they arise
    SPECIAL_PREFIX_PACKAGES="psycopg"

    # Extract base package names from requirements.txt, handling extras
    # For special packages, generate a general prefix match (e.g., ^psycopg)
    # For others, generate an exact match (e.g., ^package_name==)
    TEMP_GREP_PATTERNS=""
    while IFS= read -r line; do
        # Remove comments and leading/trailing whitespace
        clean_line=$(echo "$line" | sed -E 's/#.*//; s/^[[:space:]]*//; s/[[:space:]]*$//')

        if [ -z "$clean_line" ]; then
            continue # Skip empty lines
        fi

        # Extract the base package name (e.g., "psycopg" from "psycopg[binary,pool]>=3.0")
        base_package_name=$(echo "$clean_line" | sed -E 's/([=<>~[:space:]]).*//; s/\[.*//')

        # Check if this is a special prefix package
        IS_SPECIAL=false
        for special_pkg in $SPECIAL_PREFIX_PACKAGES; do
            if [ "$base_package_name" = "$special_pkg" ]; then
                IS_SPECIAL=true
                break
            fi
        done

        if $IS_SPECIAL; then
            # For special packages, match anything that starts with the base name
            TEMP_GREP_PATTERNS+="\n^$base_package_name"
        else
            # For regular packages, match the exact base name followed by '=='
            TEMP_GREP_PATTERNS+="\n^$base_package_name=="
        fi
    done < {requirements_file_name}

    # Remove the initial newline and write patterns to a temporary file
    echo -e "$TEMP_GREP_PATTERNS" | sed '1d' > /tmp/grep_patterns_$$.txt

    # Now, run pip freeze and filter using the generated patterns
    conda run -n lambda-docker-env-311 pip freeze | grep -E -f /tmp/grep_patterns_$$.txt > {requirements_file_name}

    # Clean up the temporary file
    rm /tmp/grep_patterns_$$.txt

    echo "Deactivating and removing conda environment 'lambda-docker-env-311'..."
    conda env remove -n lambda-docker-env-311 -y
    """

    try:
        # Use subprocess.run with cwd to execute commands in the specific directory
        # This avoids global os.chdir calls and is generally safer.
        result = subprocess.run(
            shell_command,
            shell=True,
            cwd=full_path, # Execute the command in the target directory
            check=True,    # Raise a CalledProcessError if the command returns a non-zero exit code
            capture_output=True, # Capture stdout and stderr
            text=True,      # Decode stdout/stderr as text,
            executable="/bin/bash"
        )
        print("Command Output (stdout):\n", result.stdout)
        if result.stderr:
            print("Command Errors (stderr):\n", result.stderr)

    except subprocess.CalledProcessError as e:
        print(f"Error executing command in {dir_name}:")
        print(f"Command: {e.cmd}")
        print(f"Return Code: {e.returncode}")
        print(f"Stdout: {e.stdout}")
        print(f"Stderr: {e.stderr}")
        # You might want to exit here if an error in one directory should stop the whole script
        # import sys
        # sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred for {dir_name}: {e}", file=sys.stderr)

print("\n--- Script execution completed ---")