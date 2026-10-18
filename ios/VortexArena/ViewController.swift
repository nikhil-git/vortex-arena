import UIKit
import WebKit

class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!
    private var errorView: UIView!
    private var errorLabel: UILabel!
    private var loadingIndicator: UIActivityIndicatorView!
    private var serverUrl: String = "http://192.168.1.3:3000"
    
    override var prefersStatusBarHidden: Bool {
        return true
    }
    
    override var prefersHomeIndicatorAutoHidden: Bool {
        return true
    }
    
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        return .landscape
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10/255, green: 15/255, blue: 24/255, alpha: 1.0)
        
        // Prevent screen sleep during matches
        UIApplication.shared.isIdleTimerDisabled = true
        
        // Load saved server URL from UserDefaults
        if let saved = UserDefaults.standard.string(forKey: "vortex_server_url"), !saved.isEmpty {
            serverUrl = saved
        }
        
        setupWebView()
        setupErrorView()
        loadGame()
    }
    
    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptEnabled = true
        config.setValue(true, forKey: "allowFileAccessFromFileURLs")
        config.applicationNameForUserAgent = "VortexArena-iOS/1.0"
        
        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        
        view.addSubview(webView)
        
        // Loading Spinner
        loadingIndicator = UIActivityIndicatorView(style: .large)
        loadingIndicator.color = UIColor(red: 0/255, green: 240/255, blue: 255/255, alpha: 1.0)
        loadingIndicator.center = view.center
        loadingIndicator.autoresizingMask = [.flexibleLeftMargin, .flexibleRightMargin, .flexibleTopMargin, .flexibleBottomMargin]
        loadingIndicator.hidesWhenStopped = true
        view.addSubview(loadingIndicator)
        
        // Floating Gear Button for changing Server IP
        let gearButton = UIButton(type: .system)
        gearButton.setTitle("⚙ SERVER", for: .normal)
        gearButton.setTitleColor(UIColor(red: 0/255, green: 240/255, blue: 255/255, alpha: 1.0), for: .normal)
        gearButton.titleLabel?.font = UIFont.systemFont(ofSize: 11, weight: .bold)
        gearButton.backgroundColor = UIColor(red: 10/255, green: 15/255, blue: 24/255, alpha: 0.8)
        gearButton.layer.cornerRadius = 6
        gearButton.layer.borderWidth = 1
        gearButton.layer.borderColor = UIColor(red: 0/255, green: 240/255, blue: 255/255, alpha: 0.4).cgColor
        gearButton.frame = CGRect(x: view.bounds.width - 110, y: 16, width: 90, height: 28)
        gearButton.autoresizingMask = [.flexibleLeftMargin, .flexibleBottomMargin]
        gearButton.addTarget(self, action: #selector(showServerDialog), for: .touchUpInside)
        view.addSubview(gearButton)
    }
    
    private func setupErrorView() {
        errorView = UIView(frame: view.bounds)
        errorView.backgroundColor = UIColor(red: 15/255, green: 23/255, blue: 42/255, alpha: 1.0)
        errorView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        errorView.isHidden = true
        
        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        
        let titleLabel = UILabel()
        titleLabel.text = "VORTEX ARENA"
        titleLabel.textColor = UIColor(red: 0/255, green: 240/255, blue: 255/255, alpha: 1.0)
        titleLabel.font = UIFont.systemFont(ofSize: 26, weight: .heavy)
        stack.addArrangedSubview(titleLabel)
        
        errorLabel = UILabel()
        errorLabel.text = "Unable to connect to match server\nCheck your Wi-Fi or server status."
        errorLabel.textColor = UIColor(red: 255/255, green: 51/255, blue: 102/255, alpha: 1.0)
        errorLabel.font = UIFont.systemFont(ofSize: 14, weight: .medium)
        errorLabel.textAlignment = .center
        errorLabel.numberOfLines = 0
        stack.addArrangedSubview(errorLabel)
        
        let buttonRow = UIStackView()
        buttonRow.axis = .horizontal
        buttonRow.spacing = 12
        
        let retryBtn = UIButton(type: .system)
        retryBtn.setTitle("🔄 Retry", for: .normal)
        retryBtn.setTitleColor(.white, for: .normal)
        retryBtn.backgroundColor = UIColor(red: 0/255, green: 168/255, blue: 255/255, alpha: 1.0)
        retryBtn.layer.cornerRadius = 6
        retryBtn.contentEdgeInsets = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
        retryBtn.addTarget(self, action: #selector(retryConnection), for: .touchUpInside)
        buttonRow.addArrangedSubview(retryBtn)
        
        let configBtn = UIButton(type: .system)
        configBtn.setTitle("⚙ Change Server", for: .normal)
        configBtn.setTitleColor(.white, for: .normal)
        configBtn.backgroundColor = UIColor(red: 51/255, green: 65/255, blue: 85/255, alpha: 1.0)
        configBtn.layer.cornerRadius = 6
        configBtn.contentEdgeInsets = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
        configBtn.addTarget(self, action: #selector(showServerDialog), for: .touchUpInside)
        buttonRow.addArrangedSubview(configBtn)
        
        let offlineBtn = UIButton(type: .system)
        offlineBtn.setTitle("📦 Offline Assets", for: .normal)
        offlineBtn.setTitleColor(.white, for: .normal)
        offlineBtn.backgroundColor = UIColor(red: 30/255, green: 41/255, blue: 59/255, alpha: 1.0)
        offlineBtn.layer.cornerRadius = 6
        offlineBtn.contentEdgeInsets = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
        offlineBtn.addTarget(self, action: #selector(loadOfflineAssets), for: .touchUpInside)
        buttonRow.addArrangedSubview(offlineBtn)
        
        stack.addArrangedSubview(buttonRow)
        errorView.addSubview(stack)
        
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: errorView.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: errorView.centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 500)
        ])
        
        view.addSubview(errorView)
    }
    
    private func loadGame() {
        errorView.isHidden = true
        loadingIndicator.startAnimating()
        if let url = URL(string: serverUrl) {
            let req = URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 6.0)
            webView.load(req)
        } else {
            showError("Invalid Server URL format.")
        }
    }
    
    @objc private func retryConnection() {
        loadGame()
    }
    
    @objc private func loadOfflineAssets() {
        errorView.isHidden = true
        if let localUrl = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            webView.loadFileURL(localUrl, allowingReadAccessTo: localUrl.deletingLastPathComponent())
        } else {
            showError("Offline bundle not found in application resources.")
        }
    }
    
    @objc private func showServerDialog() {
        let alert = UIAlertController(title: "Configure Match Server", message: "Enter your laptop or cloud game server address:", preferredStyle: .alert)
        alert.addTextField { tf in
            tf.placeholder = "http://192.168.1.3:3000"
            tf.text = self.serverUrl
            tf.keyboardType = .URL
            tf.autocorrectionType = .no
            tf.autocapitalizationType = .none
        }
        alert.addAction(UIAlertAction(title: "Connect", style: .default, handler: { [weak self] _ in
            guard let self = self, let tf = alert.textFields?.first, var text = tf.text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return }
            if !text.hasPrefix("http://") && !text.hasPrefix("https://") {
                text = "http://" + text
            }
            self.serverUrl = text
            UserDefaults.standard.set(self.serverUrl, forKey: "vortex_server_url")
            self.loadGame()
        }))
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel, handler: nil))
        present(alert, animated: true, completion: nil)
    }
    
    private func showError(_ msg: String) {
        loadingIndicator.stopAnimating()
        errorLabel.text = msg + "\n\nServer: \(serverUrl)\nMake sure the game server is running and your iPhone is on the same Wi-Fi."
        errorView.isHidden = false
    }
    
    // MARK: - WKNavigationDelegate
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadingIndicator.stopAnimating()
        errorView.isHidden = true
    }
    
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showError("Failed to connect: \(error.localizedDescription)")
    }
    
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showError("Connection failed: \(error.localizedDescription)")
    }
}
