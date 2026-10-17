public import Foundation
import os
import Synchronization
import Valet

/// This device's pass to each hub that requires paired devices (hub
/// hub-auth.ts): the token the hub handed it once the person approved its
/// pairing, sent as `Authorization: Owner <token>` on every request to that
/// hub. One per hub origin, kept in the shared Keychain group beside the push
/// relay's `Pairing` (which is Cawrier's id and secret, not this), so the
/// extension's calls to the hub carry it too.
public enum HubPass {
    /// The header's scheme (core hub-auth.ts `OWNER_SCHEME`).
    public static let scheme = "Owner"
    /// The browser's cookie names (core hub-auth.ts `OWNER_COOKIE`, `OWNER_COOKIE_SECURE`).
    private static let cookie = "cawco-owner"
    private static let secureCookie = "__Host-cawco-owner"
    /// Each origin's pass as last read or written in this process: nil inside
    /// when the Keychain holds none. A read the Keychain refused is not kept.
    private static let known = Mutex<[String: String?]>([:])
    private static let log = Logger(subsystem: "dev.cawco.app", category: "Pairing")

    private static func key(_ origin: String) -> String { "hub-pass.\(origin)" }

    /// A hub's origin, its key: scheme, host and port, a socket's scheme read
    /// as its page's; nil for an address with no host.
    public static func origin(_ url: URL) -> String? {
        guard let scheme = url.scheme?.lowercased(), let host = url.host()?.lowercased(), !host.isEmpty else { return nil }
        let web = scheme == "wss" ? "https" : scheme == "ws" ? "http" : scheme
        return "\(web)://\(host):\(url.port ?? (web == "https" ? 443 : 80))"
    }

    /// The pass kept for the hub `url` is on; nil when there is none.
    public static func token(for url: URL) -> String? {
        guard let origin = origin(url) else { return nil }
        return known.withLock { held in
            if let kept = held[origin] { return kept }
            do {
                let read = try SharedKeychain.data(key(origin)).map { String(decoding: $0, as: UTF8.self) }
                held[origin] = read
                return read
            } catch {
                log.error("pass for \(origin, privacy: .public) unread: \(String(describing: error), privacy: .public)")
                return nil
            }
        }
    }

    /// Keeps `token` as this device's pass to `hub`, in place of any before it.
    public static func keep(_ token: String, for hub: URL) throws(KeychainError) {
        guard let origin = origin(hub) else { return }
        try SharedKeychain.valet.setObject(Data(token.utf8), forKey: key(origin))
        known.withLock { $0[origin] = .some(token) }
    }

    /// Forgets this device's pass to `hub`: the hub refused it.
    public static func forget(_ hub: URL) throws(KeychainError) {
        guard let origin = origin(hub) else { return }
        try SharedKeychain.valet.removeObject(forKey: key(origin))
        known.withLock { $0[origin] = .some(nil) }
    }

    /// `request` as the person, when its hub holds a pass for this device.
    public static func authorize(_ request: inout URLRequest) {
        guard let url = request.url, let token = token(for: url) else { return }
        request.setValue("\(scheme) \(token)", forHTTPHeaderField: "Authorization")
    }

    /// A request for `url` on a hub, as the person when it holds a pass for this device.
    public static func request(_ url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        authorize(&request)
        return request
    }

    /// The owner cookie that carries `hub`'s pass to a page on `page` (the
    /// dashboard's origin, which a web view loads): what a browser's pairing
    /// sets there (core hub-auth.ts `ownerCookie`). Nil without a pass.
    public static func cookie(for hub: URL, on page: URL) -> HTTPCookie? {
        guard let token = token(for: hub), let host = page.host() else { return nil }
        let secure = page.scheme?.lowercased() == "https"
        var properties: [HTTPCookiePropertyKey: Any] = [
            .name: secure ? secureCookie : cookie,
            .value: token,
            .domain: host,
            .path: "/",
            .sameSitePolicy: HTTPCookieStringPolicy.sameSiteLax.rawValue,
        ]
        if secure { properties[.secure] = "TRUE" }
        return HTTPCookie(properties: properties)
    }
}
