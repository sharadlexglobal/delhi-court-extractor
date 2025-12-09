#!/usr/bin/env python3
"""
ZenRows PDF Downloader - Minimal Implementation
================================================

Downloads PDFs from SSL-protected URLs using ZenRows API.

Usage:
    python3 zenrows_pdf_downloader.py <URL> <OUTPUT_FILE> <API_KEY>

Example:
    python3 zenrows_pdf_downloader.py "https://example.com/file.pdf" output.pdf YOUR_API_KEY
"""

import sys
import requests


def download_pdf(url, output_path, api_key):
    """
    Download PDF using ZenRows API.
    
    Args:
        url: Target URL to download
        output_path: Path where PDF will be saved
        api_key: ZenRows API key
    
    Returns:
        bool: True if successful, False otherwise
    """
    # Configure API request
    params = {
        'url': url,
        'apikey': api_key,
        'premium_proxy': 'true',
    }
    
    # Make request
    print(f"Downloading from: {url}")
    print(f"Using ZenRows API...")
    
    try:
        response = requests.get(
            'https://api.zenrows.com/v1/',
            params=params,
            timeout=60
        )
        
        # Check if response is PDF
        if response.content.startswith(b'%PDF'):
            # Save PDF
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            print(f"✅ Success: Downloaded {len(response.content):,} bytes")
            print(f"Saved to: {output_path}")
            return True
        else:
            # Not a PDF - show error
            print(f"❌ Error: Response is not a PDF")
            print(f"Response: {response.text[:200]}")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ Error: Request timeout")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def main():
    # Check arguments
    if len(sys.argv) != 4:
        print("Usage: python3 zenrows_pdf_downloader.py <URL> <OUTPUT_FILE> <API_KEY>")
        print("\nExample:")
        print('  python3 zenrows_pdf_downloader.py "https://example.com/file.pdf" output.pdf YOUR_API_KEY')
        sys.exit(1)
    
    url = sys.argv[1]
    output_path = sys.argv[2]
    api_key = sys.argv[3]
    
    # Download PDF
    success = download_pdf(url, output_path, api_key)
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
