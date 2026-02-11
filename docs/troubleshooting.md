# Troubleshooting

Common issues and solutions for running, building, and deploying Milaidy.

## Installation & Runtime

### "Port already in use"
**Error**: `EADDRINUSE: address already in use :::18789`
**Cause**: Another instance of Milaidy or another process is using the required port.
**Solution**:
1.  Check if Milaidy is already running (`ps aux | grep milaidy`).
2.  Kill the process or change the port via environment variables:
    ```bash
    export MILAIDY_GATEWAY_PORT=19000
    export MILAIDY_PORT=3000
    ```

### "Node.js version not supported"
**Error**: Warning or error about Node.js version.
**Cause**: Milaidy requires Node.js 22 or higher.
**Solution**: Update Node.js. Using `nvm` or `fnm` is recommended.
```bash
nvm install 22
nvm use 22
```

## Build & Signing (macOS)

### "The application is damaged and can't be opened"
**Cause**: The app was signed but not notarized, or the notarization staple is missing.
**Solution**:
1.  Verify `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are set correctly in GitHub Actions secrets.
2.  Ensure the build machine has internet access to reach Apple's notarization servers.

### "macOS cannot verify that this app is free from malware"
**Cause**: The app is not signed at all, or signed with an invalid certificate.
**Solution**:
1.  Check `CSC_LINK` and `CSC_KEY_PASSWORD`.
2.  Ensure the certificate is a **Developer ID Application** certificate (not "Mac App Distribution").

### "The signature of the binary is invalid"
**Cause**: Missing entitlements or improper signing configuration.
**Solution**:
1.  Verify `entitlements.mac.plist` exists in `apps/app/electron/`.
2.  Ensure `hardenedRuntime: true` is set in `electron-builder.config.json`.

## Build & Signing (Windows)

### "Windows protected your PC" (SmartScreen)
**Cause**: The app is unsigned, or signed with a standard OV certificate that hasn't built up reputation yet.
**Solution**:
1.  **For users**: Click "More info" > "Run anyway".
2.  **For developers**: Sign with an EV (Extended Validation) certificate for immediate trust.

## Build & Signing (Android)

### "No key with alias found"
**Cause**: The alias specified in `ANDROID_KEY_ALIAS` (default: `milaidy`) doesn't match the alias in the keystore.
**Solution**: Verify the alias used when generating the keystore (`keytool -list -v -keystore ...`).

## CI/CD (GitHub Actions)

### Build fails silently or skips signing
**Cause**: Missing secrets often cause `electron-builder` to skip signing without erroring out (producing unsigned artifacts).
**Solution**: Go to repository Settings > Secrets and variables > Actions and verify all required secrets are present.
