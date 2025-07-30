# Misc

In this project, we use `pip-tools` to manage dependencies for various lambda functions. A python environment (Python 3.11) with `pip-tools` installed is required. 

In the directory `cdk/lamda`, there are several lambda functions. Each lambda function has its own `requirements.in`  and`requirements.txt` file.

## Pip-Compile Utility Script

The project includes a utility script located at `cdk/lambda/_local_utils_NOT_LAMBDA/pip-compile.py` that automates the process of generating `requirements.txt` files from `requirements.in` files for all lambda functions.

### Purpose

The script automates dependency management by:
- Converting `requirements.in` files (which contain high-level dependencies) to `requirements.txt` files (which contain pinned versions)
- Ensuring consistent dependency versions across all lambda functions
- Reducing manual work when updating dependencies

### How It Works

1. **Target Directories**: The script processes the following lambda function directories:
   - `text_generation`
   - `docDetailViewFunction`
   - `hybridSearchFunction`
   - `similaritySearchFunction`
   - `chartAnalyticsFunction`
   - `relatedDocumentsFunction`
   - `userFiltersFunction`
   - `llmAnalysisFunction`

2. **Process Flow**:
   - For each directory, it looks for a `requirements.in` file
   - Uses `conda run -n test-311 pip-compile` to compile the dependencies
   - Generates a `requirements.txt` file with pinned versions
   - Provides detailed output and error handling

3. **Command Execution**: The script runs the equivalent of:
   ```bash
   conda run -n test-311 pip-compile requirements.in -o requirements.txt
   ```

### Prerequisites

- Conda environment named `test-311` with Python 3.11
- `pip-tools` installed in the conda environment
- Conda available in your system PATH

### Usage

To run the script, make sure you already activated a Python 3.11 virtual environment (`venv` or `conda` are both fine):

```bash
cd cdk/lambda
python _local_utils_NOT_LAMBDA/pip-compile.py
```

### Error Handling

The script includes comprehensive error handling for:
- Missing `requirements.in` files (skips directories)
- Failed pip-compile commands (displays error details)
- Missing conda or pip-compile commands
- Unexpected errors during processing

### Output

The script provides detailed feedback including:
- Success/failure status for each directory
- Standard output and error streams from pip-compile
- Summary of completed operations