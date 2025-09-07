# Contributing to Scrum Poker Game

Thank you for your interest in contributing to our multiplayer scrum poker game! 🎮✨ Whether you're a developer, designer, tester, or have ideas to improve the agile estimation experience, we welcome your contributions.

## 🎯 Ways to Contribute

- 🐛 **Bug Reports**: Found an issue? Help us squash it!
- 💡 **Feature Requests**: Ideas for new game mechanics or improvements
- 💻 **Code Contributions**: Bug fixes, new features, performance improvements  
- 🎨 **Art & Design**: Boss sprites, UI improvements, animations
- 📝 **Documentation**: Improve README, guides, or code comments
- 🧪 **Testing**: Help test new features and multiplayer scenarios
- 🎵 **Audio**: Sound effects, background music, audio improvements

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20.16+ and npm
- **TypeScript** knowledge for code contributions
- **Git** for version control
- **Modern browser** for testing (Chrome, Firefox, Safari)

### Development Setup

1. **Fork & Clone**
   ```bash
   git clone https://github.com/YOUR-USERNAME/scrum-poker-game.git
   cd scrum-poker-game
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Database** (optional for most contributions)
   ```bash
   npm run db:push
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```
   Opens on `http://localhost:5000`

5. **Run Type Checking**
   ```bash
   npm run check
   ```

## 🎮 Project Structure

```
├── client/          # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── lib/         # Utilities, stores, types
│   │   └── styles/      # CSS and styling
├── server/          # Express backend
│   ├── gameState.ts     # Game logic and state management
│   ├── websocket.ts     # Socket.IO real-time communication
│   └── routes.ts        # API endpoints
├── shared/          # Shared types and schemas
└── attached_assets/ # Game assets (sprites, audio)
```

## 📝 Contribution Guidelines

### Code Style

- **TypeScript**: Use strict typing, avoid `any`
- **React**: Functional components with hooks
- **Formatting**: Project uses built-in formatting (Prettier/ESLint coming soon)
- **Naming**: 
  - Components: `PascalCase`
  - Functions: `camelCase` 
  - Files: `camelCase.ts` or `kebab-case.tsx`

### Game Logic Principles

- **Server Authority**: All game state changes happen server-side
- **Real-time Sync**: Use Socket.IO events for immediate feedback
- **Data Validation**: Validate inputs on both client and server
- **Multiplayer First**: Consider 2-32 player scenarios

### Commit Messages

Use clear, descriptive commit messages:
```
feat: add discussion phase for vote refinement
fix: resolve WebSocket connection drops during battle
docs: update setup instructions for contributors
style: improve mobile avatar selection carousel
```

## 🐛 Bug Reports

Before creating a bug report:
- Search existing issues to avoid duplicates
- Test on the latest version
- Try different browsers if it's UI-related

**Include in your bug report:**
- **Browser/Environment**: Chrome 120, Node.js 20.16, etc.
- **Steps to reproduce**: Numbered list of actions
- **Expected vs Actual behavior**: What should happen vs what happens
- **Screenshots/Video**: Visual bugs or UI issues
- **Game Context**: Number of players, game phase, lobby settings

**For multiplayer bugs:**
- Number of players involved
- Team assignments (Dev/QA/Spectator)
- Sequence of player actions
- Which player experienced the issue

## 💡 Feature Requests

We love new ideas! When suggesting features:

- **Game Enhancement**: How does it improve the scrum poker experience?
- **User Stories**: "As a [role], I want [feature] so that [benefit]"
- **Mockups**: Sketches or wireframes help visualize UI changes
- **Technical Notes**: Any implementation thoughts or constraints
- **Integration**: How it fits with existing Jira/agile workflows

## 🎨 Asset Contributions

### Visual Assets
- **Sprites**: 256x256 pixel art style, PNG format
- **Boss Designs**: JRPG-inspired, agile/development themed
- **UI Elements**: Retro gaming aesthetic, readable fonts
- **Lair Backgrounds**: Atmospheric, parallax-friendly

### Audio Assets
- **Sound Effects**: Short (< 2s), 44.1kHz, retro gaming style
- **Background Music**: Loopable, JRPG-inspired, adaptive
- **File Formats**: OGG preferred, MP3 acceptable
- **Volume**: Normalized, not too loud by default

## 🔄 Pull Request Process

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/amazing-new-feature
   ```

2. **Make Your Changes**
   - Write code following project conventions
   - Add tests for new functionality
   - Update documentation if needed

3. **Test Thoroughly**
   - Test single and multiplayer scenarios
   - Check different browsers and screen sizes
   - Verify real-time synchronization works

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add amazing new feature"
   ```

5. **Push and Create PR**
   ```bash
   git push origin feature/amazing-new-feature
   ```
   Then create a Pull Request on GitHub

### PR Requirements

- **Clear Title**: Describe what the PR does
- **Description**: Explain the changes and why
- **Screenshots**: For UI/visual changes
- **Testing Notes**: How you tested the changes
- **Breaking Changes**: Document any API/behavior changes
- **Related Issues**: Link to relevant issues with "Fixes #123"

## 🎯 Development Tips

### Testing Multiplayer Features
- Open multiple browser windows/tabs
- Use different browsers (Chrome + Firefox)
- Test edge cases: players joining mid-game, network drops
- Verify real-time sync across all connected players

### Game State Debugging  
- Use browser DevTools Network tab for WebSocket messages
- Server logs show detailed game state changes
- React DevTools for component state inspection

### Common Gotchas
- **WebSocket Events**: Always validate on server-side
- **React State**: Use proper dependencies in useEffect
- **TypeScript**: Shared types in `/shared` folder
- **Assets**: Place in `/attached_assets` for proper loading

## 🤝 Code of Conduct

We're committed to providing a welcoming and inclusive environment:

- **Be Respectful**: Treat all contributors with respect
- **Be Patient**: Everyone is learning and growing
- **Be Constructive**: Provide helpful feedback and suggestions
- **Have Fun**: This is a game project - enjoy the process! 🎮

## 📞 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Code Reviews**: Learn from feedback on your PRs
- **Discord** (if available): Real-time chat with contributors

## 🏆 Recognition

Contributors are recognized in:
- **CONTRIBUTORS.md**: All contributors listed
- **Release Notes**: Major contributions highlighted  
- **Game Credits**: In-game contributor acknowledgments

---

## 📜 Developer Certificate of Origin (DCO)

By contributing to this project, you certify that:

1. **You wrote the contribution** or have the right to submit it under the project's license
2. **You understand and agree** that the contribution is public and may be redistributed
3. **You grant the project** a perpetual, worldwide license to use your contribution
4. **You have read and agree** to the Developer Certificate of Origin (DCO) v1.1

### DCO Sign-off

All commits must include a DCO sign-off line. Add `-s` to your commit:

```bash
git commit -s -m "feat: add new boss battle mechanic"
```

This automatically adds:
```
Signed-off-by: Your Name <your.email@example.com>
```

### Developer Certificate of Origin
**Version 1.1**

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.

---

Ready to contribute? Check out our [good first issue](https://github.com/YOUR-REPO/labels/good%20first%20issue) label for beginner-friendly tasks!

**Happy coding!** 🚀✨