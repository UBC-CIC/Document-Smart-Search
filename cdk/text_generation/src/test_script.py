#!/usr/bin/env python3
"""
Test script for DFO Smart Search.
This script provides an interactive way to test the DFO Smart Search functionality.
"""

import os
import argparse
import logging
from main import run_test

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

def main():
    """Main function for the test script."""
    parser = argparse.ArgumentParser(description="Test the DFO Smart Search interactively")
    parser.add_argument("--role", type=str, default="public", 
                      choices=["public", "educator", "admin"],
                      help="User role")
    parser.add_argument("--region", type=str, default=None, 
                      help="AWS region to use (defaults to region in config file)")
    parser.add_argument("--session-id", type=str, default="test-session-123", 
                      help="Session ID for chat history")
    parser.add_argument("--use-ssm", action="store_true",
                      help="Use SSM parameters instead of hardcoded ones")
    parser.add_argument("--no-profile", action="store_true",
                      help="Do not use AWS profile from config file")
    
    args = parser.parse_args()
    
    print("\nDFO Smart Search Interactive Test")
    print("=================================")
    print(f"Role: {args.role}")
    print(f"Region: {args.region or 'From config file'}")
    print(f"Session ID: {args.session_id}")
    print(f"Using {'SSM parameters' if args.use_ssm else 'hardcoded parameters'}")
    print(f"Using {'default AWS credentials' if args.no_profile else 'AWS profile from config'}")
    print("=================================")
    
    # Start the interactive loop
    print("\nType your questions below (type 'exit' to quit):")
    
    try:
        while True:
            print("\n> ", end="")
            query = input()
            
            if query.lower() in ["exit", "quit", "q"]:
                print("Exiting test script...")
                break
                
            if not query.strip():
                continue
                
            # Run the query
            run_test(
                query=query,
                user_role=args.role,
                test_region=args.region,
                session_id=args.session_id,
                use_local_params=not args.use_ssm,
                use_aws_profile=not args.no_profile
            )
    
    except KeyboardInterrupt:
        print("\nTest script interrupted.")
    
    print("\nTest completed.")

if __name__ == "__main__":
    main()
