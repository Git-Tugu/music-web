const signUpForm = document.getElementById('signUpForm');
const stepToggle = document.getElementById('step-toggle');
const signInLabel = document.getElementById('signIn');

const nextStepBtn = document.getElementById('nextStepBtn');
const regName = document.getElementById('regName');
const regEmail = document.getElementById('regEmail');

const regPassword = document.getElementById('regPassword');
const regConfirmPassword = document.getElementById('regConfirmPassword');
const passwordError = document.getElementById('passwordError');

// Advance to Step 2 only once Name + Email pass native validation.
// Showing/hiding step-1 vs step-2 itself is pure CSS (#step-toggle:checked),
// this just flips the checkbox once the gate is cleared.
nextStepBtn.addEventListener('click', () => {
    if (regName.reportValidity() && regEmail.reportValidity()) {
        stepToggle.checked = true;
    }
});

// Reset the sign-up form when heading back to Sign In. Because #step-toggle
// and the password reveal checkboxes live inside #signUpForm, a plain
// form.reset() reverts them to unchecked along with the text fields —
// no manual class/type bookkeeping required.
signInLabel.addEventListener('click', () => {
    signUpForm.reset();
    if (passwordError) {
        passwordError.style.display = 'none';
        passwordError.textContent = '';
    }
});

// Handle Form Submission with validations
signUpForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const password = regPassword.value;
    const confirmPassword = regConfirmPassword.value;

    // Clear previous error states
    if (passwordError) {
        passwordError.style.display = 'none';
        passwordError.textContent = '';
    }

    // Array to capture missed validation requirements
    let errorMessages = [];

    // 1. English alphabet / characters only check (Printable ASCII 32 to 126)
    const englishOnlyRegex = /^[\x20-\x7E]*$/;
    if (!englishOnlyRegex.test(password)) {
        errorMessages.push("Password must only use the English alphabet.");
    }

    // 2. Contains uppercase English letter
    if (!/[A-Z]/.test(password)) {
        errorMessages.push("Missing an uppercase letter.");
    }

    // 3. Contains lowercase English letter
    if (!/[a-z]/.test(password)) {
        errorMessages.push("Missing a lowercase letter.");
    }

    // 4. Contains a number
    if (!/[0-9]/.test(password)) {
        errorMessages.push("Missing a number.");
    }

    // 5. Contains a symbol (any character that isn't a letter or a number)
    if (!/[^A-Za-z0-9]/.test(password)) {
        errorMessages.push("Missing a symbol.");
    }

    // If any structural condition fails, inform the user and abort submission
    if (errorMessages.length > 0) {
        if (passwordError) {
            passwordError.innerHTML = errorMessages.join("<br>");
            passwordError.style.display = 'block';
        }
        return;
    }

    // 6. Verify passwords match
    if (password !== confirmPassword) {
        if (passwordError) {
            passwordError.textContent = "Passwords do not match. Please try again.";
            passwordError.style.display = 'block';
        }
        return;
    }

    // Grab final values for API integration if all validations pass
    const userData = {
        name: regName.value,
        email: regEmail.value,
        password: password
    };

    console.log("Account created successfully:", userData);
    // Add your API registration call here
});