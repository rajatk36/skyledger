import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import "./login-signup.css"

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Basic validation
    if (!email || !password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    if (!email.includes("@")) {
      setError("Please enter a valid email address");
      setLoading(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (error: unknown) {
      console.error("Login failed:", error);
      let errorMessage = "Login failed. Please try again.";
      const code =
        error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";

      if (code === "auth/user-not-found") {
        errorMessage = "No account found with this email address";
      } else if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        errorMessage = "Incorrect password";
      } else if (code === "auth/invalid-email") {
        errorMessage = "Invalid email address";
      } else if (code === "auth/too-many-requests") {
        errorMessage = "Too many failed attempts. Please try again later";
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo">
            <i className="bi bi-shield-lock"></i>
          </div>
          <h1>Welcome Back</h1>
          <p>Sign in to your account to continue</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {error && (
            <div className="error-message">
              <i className="bi bi-exclamation-circle"></i>
              {error}
            </div>
          )}

          <div className="input-group">
            <div className="input-wrapper">
              <i className="bi bi-envelope input-icon"></i>
              <input 
                type="email" 
                placeholder="Enter your email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={error && !email ? "error" : ""}
              />
            </div>
          </div>

          <div className="input-group">
            <div className="input-wrapper">
              <i className="bi bi-lock input-icon"></i>
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="Enter your password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={error && !password ? "error" : ""}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                <i className={showPassword ? "bi bi-eye-slash" : "bi bi-eye"}></i>
              </button>
            </div>
          </div>

          <div className="form-options">
            <label className="remember-me">
              <input type="checkbox" />
              <span className="checkmark"></span>
              Remember me
            </label>
            <Link to="/forgot-password" className="forgot-password">
              Forgot password?
            </Link>
          </div>

          <button type="submit" disabled={loading} className="login-button">
            {loading ? (
              <>
                <i className="bi bi-arrow-clockwise spin"></i>
                Signing in...
              </>
            ) : (
              <>
                <i className="bi bi-box-arrow-in-right"></i>
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <div className="divider">
            <span>OR</span>
          </div>
          
          <div className="social-login">
            <button className="social-button google">
              <i className="bi bi-google"></i>
              Continue with Google
            </button>
            <button className="social-button github">
              <i className="bi bi-github"></i>
              Continue with GitHub
            </button>
          </div>

          <p className="signup-link">
            Don't have an account?{" "}
            <Link to="/signup" className="link">
              Create one here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
