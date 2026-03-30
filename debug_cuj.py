from playwright.sync_api import sync_playwright
import time

def run_debug(page):
    page.goto("http://localhost:2138")

    # Wait for the app to be reachable and initialize
    time.sleep(15)

    print("Page title:", page.title())
    body_html = page.evaluate("document.body.innerHTML")
    print("Body length:", len(body_html))

    # If the text has something like "Welcome" or something, print the first 2000 chars
    print("Body start:", body_html[:2000])

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
