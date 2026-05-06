import { useState, type ChangeEvent, type FormEvent } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";
import { Link, useNavigate } from "react-router-dom";
import "./login-signup.css"

export default function Signup() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    agreeToTerms: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const validateForm = () => {
    const { email, password, confirmPassword, firstName, lastName, agreeToTerms } = formData;

    if (!firstName.trim()) {
      setError("First name is required");
      return false;
    }

    if (!lastName.trim()) {
      setError("Last name is required");
      return false;
    }

    if (!email.trim()) {
      setError("Email is required");
      return false;
    }

    if (!email.includes("@")) {
      setError("Please enter a valid email address");
      return false;
    }

    if (!email.endsWith("@gmail.com")) {
      setError("Please use a Gmail address");
      return false;
    }

    if (!password) {
      setError("Password is required");
      return false;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      return false;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }

    if (!agreeToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy");
      return false;
    }

    return true;
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      navigate("/login");
    } catch (error: unknown) {
      console.error("Signup failed:", error);
      let errorMessage = "Signup failed. Please try again.";
      const code =
        error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";

      if (code === "auth/email-already-in-use") {
        errorMessage = "An account with this email already exists";
      } else if (code === "auth/invalid-email") {
        errorMessage = "Invalid email address";
      } else if (code === "auth/weak-password") {
        errorMessage = "Password is too weak. Please choose a stronger password";
      } else if (code === "auth/operation-not-allowed") {
        errorMessage = "Email/Password sign-up is disabled. Enable Email/Password in Firebase Console > Authentication > Sign-in method.";
      } else if (code === "auth/configuration-not-found") {
        errorMessage = "Authentication is not configured for this Firebase project. Enable Email/Password in Firebase Console.";
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-card">
        <div className="signup-header">
          <div className="logo">
            <i className="bi bi-person-plus"></i>
          </div>
          <h1>Create Account</h1>
          <p>Join us today and get started with your journey</p>
        </div>

        <form onSubmit={handleSignUp} className="signup-form">
          {error && (
            <div className="error-message">
              <i className="bi bi-exclamation-circle"></i>
              {error}
            </div>
          )}

          <div className="name-row">
            <div className="input-group">
              <div className="input-wrapper">
                <i className="bi bi-person input-icon"></i>
                <input
                  type="text"
                  name="firstName"
                  placeholder="First name"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required
                  className={error && !formData.firstName ? "error" : ""}
                />
              </div>
            </div>

            <div className="input-group">
              <div className="input-wrapper">
                <i className="bi bi-person input-icon"></i>
                <input
                  type="text"
                  name="lastName"
                  placeholder="Last name"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required
                  className={error && !formData.lastName ? "error" : ""}
                />
              </div>
            </div>
          </div>

          <div className="input-group">
            <div className="input-wrapper">
              <i className="bi bi-envelope input-icon"></i>
              <input
                type="email"
                name="email"
                placeholder="Enter your Gmail address"
                value={formData.email}
                onChange={handleInputChange}
                required
                className={error && !formData.email ? "error" : ""}
              />
            </div>
          </div>

          <div className="input-group">
            <div className="input-wrapper">
              <i className="bi bi-lock input-icon"></i>
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Create a password"
                value={formData.password}
                onChange={handleInputChange}
                required
                className={error && !formData.password ? "error" : ""}
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

          <div className="input-group">
            <div className="input-wrapper">
              <i className="bi bi-lock input-icon"></i>
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                className={error && formData.password !== formData.confirmPassword ? "error" : ""}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <i className={showConfirmPassword ? "bi bi-eye-slash" : "bi bi-eye"}></i>
              </button>
            </div>
          </div>

          <div className="password-strength">
            <div className="strength-bar">
              <div 
                className={`strength-fill ${formData.password.length >= 6 ? 'strong' : formData.password.length >= 4 ? 'medium' : 'weak'}`}
              ></div>
            </div>
            <span className="strength-text">
              {formData.password.length >= 6 ? 'Strong' : formData.password.length >= 4 ? 'Medium' : 'Weak'} password
            </span>
          </div>

          <div className="terms-checkbox">
            <label className="terms-label">
              <input
                type="checkbox"
                name="agreeToTerms"
                checked={formData.agreeToTerms}
                onChange={handleInputChange}
                className={error && !formData.agreeToTerms ? "error" : ""}
              />
              <span className="checkmark"></span>
              I agree to the{" "}
              <Link to="/terms" className="terms-link">Terms of Service</Link>
              {" "}and{" "}
              <Link to="/privacy" className="terms-link">Privacy Policy</Link>
            </label>
          </div>

          <button type="submit" disabled={loading} className="signup-button">
            {loading ? (
              <>
                <i className="bi bi-arrow-clockwise spin"></i>
                Creating account...
              </>
            ) : (
              <>
                <i className="bi bi-person-plus"></i>
                Create Account
              </>
            )}
          </button>
        </form>

        <div className="signup-footer">
          <div className="divider">
            <span>or</span>
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

          <p className="login-link">
            Already have an account?{" "}
            <Link to="/login" className="link">
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
