import AuthenticationServices
import CawCoCable
import OSLog

/// CawCo's passkey credential provider: lets CawCo-managed passkeys work for
/// any relying party without associated domain restrictions. The system invokes
/// this extension when a website or app requests a passkey that CawCo has
/// registered in `ASCredentialIdentityStore`.
///
/// The extension receives the relying party's `clientDataHash` directly from
/// the system and signs it with the Secure Enclave key from the shared
/// Keychain — the correct signature that the browser will verify.
class CredentialProviderViewController: ASCredentialProviderViewController {
    private let store = PasskeyStore()
    private let log = Logger(subsystem: "dev.cawco.app", category: "CredentialProvider")

    // MARK: - Passkey assertion (iOS 17+)

    /// The system asks to provide a credential without showing UI. Passkey
    /// assertions with Secure Enclave keys need the device unlocked, so this
    /// path reports that user interaction is required and the system calls
    /// `prepareInterfaceToProvideCredential` next.
    override func provideCredentialWithoutUserInteraction(
        for credentialRequest: ASCredentialRequest
    ) {
        extensionContext.cancelRequest(
            withError: ASExtensionError(.userInteractionRequired))
    }

    /// The system asks to provide a credential with the extension's UI visible.
    /// Looks up the Secure Enclave key for the requested credential, signs the
    /// `clientDataHash`, and returns the assertion to the system.
    override func prepareInterfaceToProvideCredential(
        for credentialRequest: ASCredentialRequest
    ) {
        guard let passkeyRequest = credentialRequest as? ASPasskeyCredentialRequest,
              let identity = passkeyRequest.credentialIdentity
                  as? ASPasskeyCredentialIdentity
        else {
            log.error("credential request is not a passkey request")
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
            return
        }

        let rpId = identity.relyingPartyIdentifier
        let credentialId = identity.credentialID
        let clientDataHash = passkeyRequest.clientDataHash

        log.info("passkey assertion for RP \(rpId, privacy: .public)")

        guard let credential = store.credential(for: credentialId) else {
            log.error("no credential in the store for the requested ID")
            extensionContext.cancelRequest(
                withError: ASExtensionError(.credentialIdentityNotFound))
            return
        }

        do {
            let (authData, signature) = try store.assert(
                credential: credential,
                clientDataHash: clientDataHash)

            let assertion = ASPasskeyAssertionCredential(
                userHandle: credential.userHandle,
                relyingParty: rpId,
                signature: signature,
                clientDataHash: clientDataHash,
                authenticatorData: authData,
                credentialID: credentialId)

            extensionContext.completeAssertionRequest(using: assertion)
        } catch {
            log.error("assertion signing failed: \(String(describing: error), privacy: .public)")
            extensionContext.cancelRequest(withError: ASExtensionError(.failed))
        }
    }

    // MARK: - Credential list

    /// Shows the available passkeys when the user opens the full credential
    /// list from the autofill bar. The system calls
    /// `prepareInterfaceToProvideCredential` when the user picks one.
    override func prepareCredentialList(
        for serviceIdentifiers: [ASCredentialServiceIdentifier],
        requestParameters: ASPasskeyCredentialRequestParameters
    ) {
        let rpId = requestParameters.relyingPartyIdentifier
        let credentials = store.credentials(for: rpId)

        log.info("credential list for RP \(rpId, privacy: .public): \(credentials.count) stored")

        if credentials.isEmpty {
            extensionContext.cancelRequest(
                withError: ASExtensionError(.credentialIdentityNotFound))
            return
        }

        // Sync the store's credentials into ASCredentialIdentityStore so the
        // system shows them in autofill. Future launches will find them there
        // without hitting this method.
        syncIdentities(credentials)
    }

    // MARK: - Identity sync

    /// Registers the store's credentials with `ASCredentialIdentityStore` so
    /// the system offers them in autofill for their relying parties.
    private func syncIdentities(_ credentials: [PasskeyStore.Credential]) {
        let identities: [ASPasskeyCredentialIdentity] = credentials.map { cred in
            ASPasskeyCredentialIdentity(
                relyingPartyIdentifier: cred.rpId,
                userName: cred.userName ?? "",
                credentialID: cred.credentialId,
                userHandle: cred.userHandle,
                recordIdentifier: cred.credentialId.base64EncodedString())
        }
        ASCredentialIdentityStore.shared.saveCredentialIdentities(identities)
    }
}
