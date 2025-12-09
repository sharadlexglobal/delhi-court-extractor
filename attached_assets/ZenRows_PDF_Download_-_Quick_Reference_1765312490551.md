# ZenRows PDF Download - Quick Reference

## Minimal Working Code

```python
import requests

params = {
    'url': 'TARGET_URL',
    'apikey': 'YOUR_ZENROWS_API_KEY',
    'premium_proxy': 'true',
}

response = requests.get('https://api.zenrows.com/v1/', params=params, timeout=60)

if response.content.startswith(b'%PDF'):
    with open('output.pdf', 'wb') as f:
        f.write(response.content)
    print("Success")
else:
    print(f"Error: {response.text}")
```

---

## Command Line

```bash
python3 zenrows_pdf_downloader.py "URL" output.pdf API_KEY
```

---

## Tested Example

**URL**:
```
https://southwestdelhi.dcourts.gov.in/wp-admin/admin-ajax.php?es_ajax_request=1&action=get_order_pdf&input_strings=eyJjaW5vIjoiRExXVDAxMDEyNzk0MjAyNSIsIm9yZGVyX25vIjoxLCJvcmRlcl9kYXRlIjoiMjAyNS0xMi0wOSJ9
```

**API Key**: `a20cbd4b5d3c693f8ede3c47d70e310d803177b0`

**Result**: ✅ Downloaded 94,225 bytes PDF

---

## Key Parameters

| Parameter | Value | Required |
|-----------|-------|----------|
| `url` | Target URL | Yes |
| `apikey` | Your API key | Yes |
| `premium_proxy` | `"true"` | Yes (for SSL issues) |
| `js_render` | `"true"` | No (not for PDFs) |

---

## Validation

```python
# Check if response is PDF
response.content.startswith(b'%PDF')  # Returns True for PDF
```

---

## Error Handling

```python
if response.status_code == 200:
    if response.content.startswith(b'%PDF'):
        # Success
        save_pdf()
    else:
        # Not a PDF
        print(response.text)
else:
    # HTTP error
    print(f"HTTP {response.status_code}")
```

---

## Credits Cost

- Basic request: 1 credit
- With `premium_proxy`: 1 credit
- With `js_render`: 5 credits

**Free Trial**: 1,000 credits

---

## Why It Works

**Problem**: Direct download fails with SSL error  
**Solution**: ZenRows routes through premium residential proxies  
**Result**: SSL issues handled automatically

---

## Get API Key

1. Sign up: https://www.zenrows.com/
2. Dashboard → Copy API key
3. Free trial: 1,000 credits, no credit card

---

## Files Provided

1. `zenrows_pdf_downloader.py` - Minimal script (60 lines)
2. `ZENROWS_TECHNICAL_GUIDE.md` - Complete documentation
3. `ZENROWS_QUICK_REFERENCE.md` - This file

---

**Status**: ✅ Tested and Working  
**Date**: December 9, 2025
