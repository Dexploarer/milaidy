from playwright.sync_api import sync_playwright
import time

def run_debug(page):
    page.goto("http://localhost:2138")

    # Wait for the app to be reachable and initialize
    time.sleep(15)

    body_text = page.evaluate("document.body.innerText")
    print("Body Text:", body_text)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            run_debug(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            context.close()
            browser.close()
