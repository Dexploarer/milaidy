# Deployment & Release Guide

This guide covers the process of signing, notarizing, and releasing Milaidy for desktop and mobile platforms.

## Prerequisites

- **Apple Developer Account**: Required for macOS notarization and iOS distribution ($99/year).
- **Google Play Console Account**: Required for Android distribution ($25 one-time).
- **Code Signing Certificate**: Optional but recommended for Windows (EV or OV cert).

## Automated Releases (GitHub Actions)

Milaidy uses GitHub Actions to automate the build and release process.

### Workflow
1.  **Tag Push**: Pushing a tag (e.g., `v2.0.0`) triggers the `Build & Release` workflow.
2.  **Build**: The workflow builds the app for macOS (Intel & Apple Silicon), Windows, and Linux.
3.  **Sign**: Binaries are signed using the provided secrets.
4.  **Notarize**: macOS binaries are notarized with Apple.
5.  **Release**: A GitHub Release is created with all artifacts and checksums.

### Required Secrets

To enable automated signing, you must configure the following secrets in your repository settings:

#### macOS (Signing & Notarization)
| Secret | Description |
|---|---|
| `CSC_LINK` | Base64-encoded `.p12` Developer ID Application certificate. |
| `CSC_KEY_PASSWORD` | Password for the `.p12` certificate. |
| `APPLE_ID` | Apple ID email address. |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password generated at appleid.apple.com. |
| `APPLE_TEAM_ID` | Your Apple Team ID (e.g., `25877RY2EH`). |

#### Windows (Optional)
| Secret | Description |
|---|---|
| `WIN_CSC_LINK` | Base64-encoded `.pfx` code signing certificate. |
| `WIN_CSC_KEY_PASSWORD` | Password for the `.pfx` certificate. |

#### Android (Optional)
| Secret | Description |
|---|---|
| `ANDROID_KEYSTORE` | Base64-encoded keystore file. |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password. |
| `ANDROID_KEY_ALIAS` | Key alias (default: `milaidy`). |
| `ANDROID_KEY_PASSWORD` | Key password. |

## Platform Specifics

### macOS
- **Gatekeeper**: Requires notarization to run without warnings.
- **Certificate**: Must be a "Developer ID Application" certificate.
- **Entitlements**: `entitlements.mac.plist` must be present and `hardenedRuntime` enabled.

### Windows
- **SmartScreen**: Unsigned apps trigger a warning. EV certificates provide immediate trust; OV certificates require reputation building.
- **Installer**: Use NSIS for the setup executable.

### Mobile (iOS & Android)
- **iOS**: Uses Capacitor to build the native project. Requires Xcode for final archive and upload to App Store Connect.
- **Android**: Uses Capacitor and Android Studio. Requires a signing keystore for release builds.

## Manual Release Steps

1.  **Bump Version**: Update the version in `package.json`.
2.  **Tag**: `git tag vX.Y.Z`
3.  **Push**: `git push origin vX.Y.Z`
4.  **Monitor**: Watch the GitHub Actions run.
5.  **Verify**: Check the release artifacts and checksums.

For detailed steps on generating certificates and keys, refer to the platform documentation or `APP_SETUP.md` in the repository history.
