
import React, { useState } from 'react';
import { LockIcon } from './Icons';

interface LoginScreenProps {
  onLogin: (user: string, pass: string) => boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = onLogin(username, password);
    if (!success) {
      setError('Invalid username or password.');
      setPassword(''); // Clear password on failure
    } else {
      setError('');
    }
  };

  return (
    <div className="bg-black min-h-screen flex items-center justify-center p-4 font-sans text-gray-200">
      <div className="w-full max-w-sm">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 shadow-xl animate-fade-in-up">
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="bg-gray-800 p-3 rounded-full mb-4">
              <LockIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h1 className="text-2xl font-bold text-white text-center tracking-wider">
              Authentication Required
            </h1>
          </div>
          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="username">
                Username
              </label>
              <input
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-shadow"
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-gray-400 text-sm font-bold mb-2" htmlFor="password">
                Password
              </label>
              <input
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-shadow"
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
            <div className="flex items-center justify-between">
              <button
                className="w-full bg-white text-black font-bold py-3 px-4 rounded-md hover:bg-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-white"
                type="submit"
              >
                Sign In
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
