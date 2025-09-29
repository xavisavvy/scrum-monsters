# Security Policy

## 🛡️ Reporting a Vulnerability

If you discover a security vulnerability in this multiplayer scrum poker game, please report it to us as soon as possible. We appreciate your efforts to responsibly disclose your findings and help keep our users safe.

### How to Report

- **GitHub Security**: Use GitHub's built-in private vulnerability reporting feature by clicking "Report a vulnerability" in the Security tab
- **Email**: Send details to [Preston](mailto:preston+scrummonsters-security@prestonfarr.com)
- **Response Time**: We aim to respond within 48 hours

### What to Include

Please include the following information in your report:

- **Clear description** of the vulnerability
- **Steps to reproduce** the issue
- **Proof of concept** (if applicable)
- **Impact assessment** and affected systems
- **Environment details** (browser, Node.js version, etc.)
- **Suggested remediation** (if known)

### Response Process

1. **Acknowledgment**: We'll confirm receipt within 48 hours
2. **Assessment**: We'll evaluate the severity and impact
3. **Updates**: Regular status updates every 5-7 days
4. **Resolution**: Critical issues within 7 days, others within 30 days
5. **Disclosure**: Coordinated public disclosure after fix

### Security Scope

**In Scope:**
- Authentication and session management
- Real-time WebSocket communications (Socket.IO)
- Database queries and data validation
- Client-side input validation
- Cross-site scripting (XSS) prevention
- Server-side request forgery (SSRF)
- SQL injection in database operations
- Unauthorized access to lobbies/games

**Out of Scope:**
- Social engineering attacks
- Physical security issues
- DDoS attacks on infrastructure
- Issues in third-party dependencies (report directly to maintainers)

## 🔒 Security Features

This project implements several security measures:

### Backend Security
- **Input Validation**: Zod schema validation for all API inputs
- **Session Security**: Secure session management with PostgreSQL store
- **CORS Protection**: Configured cross-origin resource sharing
- **Rate Limiting**: Socket.IO connection and event rate limiting
- **SQL Injection Prevention**: Drizzle ORM with parameterized queries

### Frontend Security  
- **XSS Prevention**: React's built-in XSS protection
- **Content Security Policy**: Configured CSP headers
- **Secure WebSocket**: TLS-encrypted Socket.IO connections
- **Input Sanitization**: Client-side data validation

### Real-time Security
- **Lobby Access Control**: Unique invite codes and host privileges
- **Player Authentication**: Session-based player verification
- **Event Validation**: Server-side validation of all game events
- **Anti-cheating**: Server-side game state validation

## 🚨 Known Security Considerations

### WebSocket Security
- All real-time communications are validated server-side
- Players can only modify their own game actions
- Lobby hosts have elevated privileges that are verified
- Game state is authoritative on the server

### Data Privacy
- Player names and game data are stored temporarily
- No persistent personal data collection
- Session data expires automatically
- Local storage used only for preferences

## 📋 Security Updates

We regularly:
- Monitor dependencies for vulnerabilities with Dependabot
- Review security advisories for Node.js and React
- Update packages with security patches
- Conduct security reviews of new features

## 🏆 Recognition

Security researchers who responsibly disclose vulnerabilities will be:
- Acknowledged in our security advisory (with permission)
- Listed in our contributors section
- Credited in release notes for security fixes

---

**Last Updated**: September 2025  
**Next Review**: Quarterly
