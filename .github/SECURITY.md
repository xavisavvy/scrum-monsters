# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| Latest (main branch) | :white_check_mark: |
| Open Beta | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in Scrum Monsters, please report it privately to help us address it before public disclosure.

### How to Report

1. **GitHub Security Advisories (Recommended)**
   - Go to https://github.com/xavisavvy/scrum-monsters/security/advisories/new
   - Click "Report a vulnerability"
   - Fill out the form with detailed information

2. **Email**
   - Send details to: security@scrummonsters.com
   - Use the subject line: "[SECURITY] Brief description"
   - Include as much detail as possible

### What to Include

Please provide:

- **Type of vulnerability** (e.g., XSS, SQL injection, authentication bypass)
- **Location** (file path, URL, or component affected)
- **Steps to reproduce** (detailed instructions)
- **Potential impact** (what an attacker could do)
- **Suggested fix** (if you have one)
- **Your contact information** (for follow-up questions)

### What to Expect

- **Acknowledgment:** We'll acknowledge your report within 48 hours
- **Updates:** We'll keep you informed as we investigate and develop a fix
- **Credit:** We'll credit you in the security advisory (unless you prefer to remain anonymous)
- **Timeline:** We aim to release fixes for critical vulnerabilities within 7 days

### Scope

**In scope:**
- Authentication and session management issues
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Server-side injection vulnerabilities
- Sensitive data exposure
- Broken access control
- Security misconfigurations

**Out of scope:**
- Denial of service attacks on the demo instance
- Issues in third-party dependencies (please report directly to the dependency maintainers)
- Social engineering attacks
- Physical attacks

### Safe Harbor

We support responsible disclosure and will not pursue legal action against security researchers who:

- Make a good faith effort to avoid privacy violations and service disruption
- Only interact with accounts they own or with explicit permission
- Do not publicly disclose the vulnerability before we've had a chance to address it
- Follow this policy

## Security Best Practices for Users

When using Scrum Monsters:

- Keep your browser updated to the latest version
- Use strong, unique lobby codes when creating sessions
- Don't share lobby links publicly if you're discussing sensitive project information
- Be cautious about browser extensions that might interfere with the game
- Report suspicious behavior or abuse through our [issue tracker](https://github.com/xavisavvy/scrum-monsters/issues)

## Security Measures We Take

- Regular dependency updates and security audits
- HTTPS encryption for all connections
- WebSocket security with proper validation
- Input sanitization and output encoding
- Secure session management
- Rate limiting on sensitive operations

## Questions?

If you have questions about this policy, contact us at security@scrummonsters.com or open a [GitHub Discussion](https://github.com/xavisavvy/scrum-monsters/discussions).

---

**Last Updated:** September 2025
