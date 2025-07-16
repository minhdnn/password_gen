import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';
import { KeyIcon, GenerateIcon, ClipboardIcon, CheckIcon, EyeIcon, EyeSlashIcon, TrashIcon, StarIcon, ExclamationTriangleIcon, HistoryIcon } from './icons';


// --- Helper Functions and Constants ---

const CHAR_SETS = {
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    numbers: '0123456789',
    symbols: '!@#$%^&*()_+-=[]{}|;:\'",.<>/?~`',
};

const COLOR_MAP = {
    lowercase: 'text-emerald-400',
    uppercase: 'text-amber-400',
    numbers: 'text-cyan-400',
    symbols: 'text-fuchsia-400',
    default: 'text-slate-300',
};

const getCharType = (char) => {
    if (CHAR_SETS.lowercase.includes(char)) return 'lowercase';
    if (CHAR_SETS.uppercase.includes(char)) return 'uppercase';
    if (CHAR_SETS.numbers.includes(char)) return 'numbers';
    if (CHAR_SETS.symbols.includes(char)) return 'symbols';
    return 'default';
};

const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
const symbolRegex = new RegExp(`[${escapeRegExp(CHAR_SETS.symbols)}]`);

const COMMON_PASSWORDS = new Set(['password', '123456', '12345678', 'qwerty', '12345', '123456789', '111111', 'password123', 'admin', 'user', 'iloveyou']);
const SEQUENCES_ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const SEQUENCES_NUM = '0123456789';
const KEYBOARD_PATTERNS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

const strengthLevelsData = [
    { level: 0, bits: 25, name: 'Very Weak', comment: "Way too weak. A password like this could be cracked in seconds. Avoid using it anywhere, even for temporary stuff.", color: '#ef4444' },
    { level: 1, bits: 40, name: 'Weak', comment: "Still pretty weak. Maybe okay for throwaway accounts or temporary logins, but don't use this where it matters.", color: '#f97316' },
    { level: 2, bits: 60, name: 'Fair', comment: "Not terrible, but not great either. Could work for low-risk accounts, but consider making it longer or adding more variety.", color: '#eab308' },
    { level: 3, bits: 80, name: 'Moderate', comment: "Decent. Probably fine for casual sites or apps, but don't use it for banking, email, or anything sensitive.", color: '#a3e635' },
    { level: 4, bits: 100, name: 'Strong', comment: "Nice! This would work well for most accounts. Still, using a password manager to create and store it is your best bet.", color: '#4ade80' },
    { level: 5, bits: 120, name: 'Very Strong', comment: "Solid stuff. You can confidently use this for sensitive accounts like your email or cloud storage.", color: '#22c55e' },
    { level: 6, bits: Infinity, name: 'Excellent', comment: "Top-tier. This one's ready for high-security needs like financial accounts, admin panels, or encrypted drives.", color: '#06b6d4' },
];

const simpleStrengthLevels = [
    { level: 0, name: 'Very Weak', color: '#ef4444' },
    { level: 1, name: 'Weak', color: '#f97316' },
    { level: 2, name: 'Fair', color: '#eab308' },
    { level: 3, name: 'Moderate', color: '#a3e635' },
    { level: 4, name: 'Strong', color: '#4ade80' },
    { level: 5, name: 'Very Strong', color: '#22c55e' },
    { level: 6, name: 'Excellent', color: '#06b6d4' },
];

const calculateEntropyWithPenalties = (password) => {
    if (!password) return { finalEntropy: 0, penaltyReasons: [], baseEntropy: 0, penalties: 0 };
    
    const len = password.length;
    
    let poolSize = 0;
    if (/[a-z]/.test(password)) poolSize += 26;
    if (/[A-Z]/.test(password)) poolSize += 26;
    if (/[0-9]/.test(password)) poolSize += 10;
    if (symbolRegex.test(password)) poolSize += CHAR_SETS.symbols.length;

    if (poolSize === 0) return { finalEntropy: 0, penaltyReasons: [], baseEntropy: 0, penalties: 0 };
    const baseEntropy = len * Math.log2(poolSize);

    let penalties = 0;
    const penaltyReasons = [];
    const lowerCasePassword = password.toLowerCase();

    for (const common of COMMON_PASSWORDS) {
        if (lowerCasePassword.includes(common)) {
            penalties += 20;
            if (!penaltyReasons.includes('common')) penaltyReasons.push('common');
            break;
        }
    }
    
    const charCounts: { [key: string]: number } = {};
    for (const char of lowerCasePassword) {
        charCounts[char] = (charCounts[char] || 0) + 1;
    }
    const repetitionPenalty = Object.values(charCounts).reduce((acc, count) => acc + (count > 1 ? (count - 1) * 3 : 0), 0);
    if (repetitionPenalty > len) {
        penalties += repetitionPenalty;
        if (!penaltyReasons.includes('repetition')) penaltyReasons.push('repetition');
    }

    let sequencePenalty = 0;
    for (let i = 0; i < lowerCasePassword.length - 2; i++) {
        const sub = lowerCasePassword.substring(i, i + 3);
        if (SEQUENCES_ALPHA.includes(sub) || SEQUENCES_ALPHA.split('').reverse().join('').includes(sub) || SEQUENCES_NUM.includes(sub) || SEQUENCES_NUM.split('').reverse().join('').includes(sub)) {
            sequencePenalty += 3;
        }
    }
    if (sequencePenalty > 0) {
        penalties += sequencePenalty;
        if (!penaltyReasons.includes('sequence')) penaltyReasons.push('sequence');
    }

    let keyboardPenalty = 0;
    for (const pattern of KEYBOARD_PATTERNS) {
        for (let i = 0; i < lowerCasePassword.length - 2; i++) {
            const sub = lowerCasePassword.substring(i, i + 3);
            if (pattern.includes(sub) || [...pattern].reverse().join('').includes(sub)) {
                keyboardPenalty += 4;
            }
        }
    }
    if(keyboardPenalty > 0) {
        penalties += keyboardPenalty;
        if (!penaltyReasons.includes('keyboard')) penaltyReasons.push('keyboard');
    }

    const finalEntropy = Math.max(0, baseEntropy - penalties);
    return { finalEntropy, penaltyReasons, baseEntropy, penalties };
};


const calculateSimpleStrength = (password) => {
    if (!password) return null;
    const { finalEntropy } = calculateEntropyWithPenalties(password);
    
    let level;
    if (finalEntropy >= 120) level = 6;
    else if (finalEntropy >= 100) level = 5;
    else if (finalEntropy >= 80) level = 4;
    else if (finalEntropy >= 60) level = 3;
    else if (finalEntropy >= 40) level = 2;
    else if (finalEntropy >= 25) level = 1;
    else level = 0;
    
    return simpleStrengthLevels[level];
};


const formatCrackTime = (seconds) => {
    if (seconds < 1) return '< 1 sec';
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
    if (seconds < 31536000) return `${Math.round(seconds / 86400)} days`;
    
    const years = seconds / 31536000;
    if (years < 1000) return `${Math.round(years)} years`;
    if (years < 1e6) return `${(years / 1e3).toFixed(1)}k years`;
    if (years < 1e9) return `${(years / 1e6).toFixed(1)}m years`;
    if (years < 1e12) return `${(years / 1e9).toFixed(1)}b years`;
    return 'Eternity';
};


const calculateStrengthReport = (password) => {
    if (!password) return null;

    const { finalEntropy, penaltyReasons, baseEntropy, penalties } = calculateEntropyWithPenalties(password);
    const combinations = Math.pow(2, finalEntropy);

    const crackTimes = {
        laptop: formatCrackTime(combinations / 1e6),
        gpuCluster: formatCrackTime(combinations / 1e9),
        supercomputer: formatCrackTime(combinations / 1e12),
    };

    const levelData = strengthLevelsData.find(level => finalEntropy < level.bits) || strengthLevelsData[strengthLevelsData.length - 1];
    
    let finalComment = levelData.comment;
    if (penalties > baseEntropy * 0.4 && penaltyReasons.length > 0) {
        if (penaltyReasons.includes('common')) finalComment = "Uh-oh — this password contains something super common. Hackers try these first, so it's not safe for anything.";
        else if (penaltyReasons.includes('repetition')) finalComment = "It looks long, but there's too much repetition. That makes it easier to crack than you'd think.";
        else if (penaltyReasons.includes('sequence')) finalComment = "Avoid patterns like 'abc' or '123' — they're predictable and easy to brute-force.";
        else if (penaltyReasons.includes('keyboard')) finalComment = "Patterns like 'qwerty' or 'asdf' are a hacker's favorite guess. Try mixing things up more.";
    }

    return { ...levelData, comment: finalComment, length: password.length, entropy: Math.round(finalEntropy), crackTimes };
};

const randomCrypto = (max) => {
    const maxValidValue = Math.floor(4294967295 / max) * max;
    let randomValue;
    do {
        const randomValues = new Uint32Array(1);
        crypto.getRandomValues(randomValues);
        randomValue = randomValues[0];
    } while (randomValue >= maxValidValue);
    return randomValue % max;
};

const formatTimestamp = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' - ' + date.toLocaleDateString();
};

const CountdownTimer = ({ expiresAt, className = '' }) => {
    const [timeLeft, setTimeLeft] = useState(expiresAt - Date.now());

    useEffect(() => {
        const interval = setInterval(() => {
            const newTimeLeft = expiresAt - Date.now();
            if (newTimeLeft <= 0) {
                setTimeLeft(0);
                clearInterval(interval);
            } else {
                setTimeLeft(newTimeLeft);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [expiresAt]);

    if (timeLeft <= 0) return null;

    const minutes = Math.floor(timeLeft / 60000).toString().padStart(2, '0');
    const seconds = Math.floor((timeLeft % 60000) / 1000).toString().padStart(2, '0');

    return (<span className={className}>({minutes}:{seconds})</span>);
};


// --- React Components ---

const HistoryModal = ({ onClose, history, onClearHistory, onCopy }) => {
    const [revealedPasswords, setRevealedPasswords] = useState(new Set());

    const toggleReveal = (timestamp) => {
        setRevealedPasswords(prev => {
            const newSet = new Set(prev);
            newSet.has(timestamp) ? newSet.delete(timestamp) : newSet.add(timestamp);
            return newSet;
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2 }}
                className="bg-slate-800/70 backdrop-blur-md border border-slate-700/60 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b border-slate-700 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2"><HistoryIcon className="w-5 h-5 text-cyan-400"/>Generation History</h2>
                    <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-700 leading-none text-3xl transition-colors">&times;</button>
                </div>
                <div className="overflow-y-auto p-4 flex-grow">
                    {history.length > 0 ? (
                        <ul className="space-y-3">
                            {history.map((entry) => (
                                <li key={entry.timestamp.getTime()} className="flex items-center justify-between p-3 bg-slate-900/40 border border-slate-700/80 rounded-lg">
                                    <div className="flex-grow pr-4">
                                        <span className="font-mono text-sm text-slate-200 tracking-wider break-all">
                                            {revealedPasswords.has(entry.timestamp.getTime()) ? entry.password : '•'.repeat(entry.password.length)}
                                        </span>
                                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                                            <span>{formatTimestamp(entry.timestamp)}</span>
                                            <span className="text-rose-400/70">Expires <CountdownTimer expiresAt={entry.expiresAt} /></span>
                                        </div>
                                    </div>
                                    <div className="flex items-center flex-shrink-0">
                                        <button onClick={() => toggleReveal(entry.timestamp.getTime())} className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg">
                                            {revealedPasswords.has(entry.timestamp.getTime()) ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                                        </button>
                                        <button onClick={() => onCopy(entry.password)} className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg">
                                            <ClipboardIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-slate-500 py-8">History is empty.</p>
                    )}
                </div>
                {history.length > 0 && (
                    <div className="p-4 border-t border-slate-700 flex-shrink-0">
                        <button
                            onClick={onClearHistory}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-md transition-colors border border-rose-500/20"
                        >
                            <TrashIcon className="w-4 h-4" />
                            Clear All History Now
                        </button>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};

const CheckboxOption = ({ id, label, checked, onChange, colorClass }) => (
    <label htmlFor={id} className={`relative flex items-center justify-center gap-2 cursor-pointer select-none rounded-lg p-3 text-sm font-semibold transition-all duration-200 w-full border-2 ${checked ? 'border-cyan-500/80 bg-cyan-500/20 text-white' : 'bg-slate-700/50 hover:bg-slate-700 border-transparent text-slate-300'}`}>
        <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
        <span className={checked ? colorClass : 'text-slate-400'}>{label}</span>
    </label>
);

const StrengthReport = ({ report }) => {
    if (!report) return null;

    const statCardClasses = "bg-slate-800/60 p-4 rounded-lg text-center border border-slate-700/70";

    return (
        <div className="p-5 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl space-y-5">
            <div>
                 <p className="text-center font-bold text-xl mb-2" style={{ color: report.color }}>
                    {report.name}
                </p>
                <div className="w-full bg-slate-700 rounded-full h-2.5">
                    <motion.div 
                        className="h-2.5 rounded-full" 
                        initial={{width: 0}}
                        animate={{ width: `${((report.level + 1) / 7) * 100}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        style={{ backgroundColor: report.color }}
                    />
                </div>
            </div>

            <p className="text-center text-slate-300 text-sm">{report.comment}</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-700/80">
                <div className={statCardClasses}>
                    <span className="block text-xs text-slate-400 font-medium uppercase tracking-wider">Length</span>
                    <strong className="text-2xl font-bold text-white">{report.length}</strong>
                </div>
                <div className={statCardClasses}>
                    <span className="block text-xs text-slate-400 font-medium uppercase tracking-wider">Entropy</span>
                    <strong className="text-2xl font-bold text-white">{report.entropy} bits</strong>
                </div>
            </div>
             <div className="pt-4 border-t border-slate-700/80">
                <h4 className="text-center font-medium text-slate-300 mb-3 text-sm uppercase tracking-wider">Estimated Time to Crack</h4>
                <div className="text-xs text-slate-400 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className={statCardClasses}>
                        <span className="font-bold block text-lg text-white">{report.crackTimes.laptop}</span>
                        <span className="text-slate-500">Laptop</span>
                    </div>
                    <div className={statCardClasses}>
                        <span className="font-bold block text-lg text-white">{report.crackTimes.gpuCluster}</span>
                        <span className="text-slate-500">GPU Cluster</span>
                    </div>
                    <div className={statCardClasses}>
                        <span className="font-bold block text-lg text-white">{report.crackTimes.supercomputer}</span>
                        <span className="text-slate-500">Supercomputer</span>
                    </div>
                </div>
            </div>
        </div>
    );
};


const PasswordToolkit = () => {
    const userPasswordInputRef = useRef(null);
    const previousPasswordRef = useRef(null);
    
    const [generatedPassword, setGeneratedPassword] = useState('');
    const [displayedPassword, setDisplayedPassword] = useState('');
    const [passwordLength, setPasswordLength] = useState(16);
    const [passwordLengthInput, setPasswordLengthInput] = useState('16');
    const [options, setOptions] = useState({ includeUppercase: true, includeLowercase: true, includeNumbers: true, includeSymbols: true });
    const [isPasswordVisible, setIsPasswordVisible] = useState(true);
    const [copied, setCopied] = useState(false);
    
    const [userStrength, setUserStrength] = useState(null);
    const [simpleStrength, setSimpleStrength] = useState(null);
    const [userSimpleStrength, setUserSimpleStrength] = useState(null);
    const [generationCount, setGenerationCount] = useState(0);
    const [passwordHistory, setPasswordHistory] = useState([]);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    
    const [clipboardClearTimer, setClipboardClearTimer] = useState({ id: null, expiresAt: null });
    const [activeView, setActiveView] = useState('generator');

    const handleClearClipboard = useCallback(async () => {
        try {
            const randomString = (length) => Array.from(crypto.getRandomValues(new Uint8Array(length)), byte => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[byte % 62]).join('');
            await navigator.clipboard.writeText(randomString(32));
            await new Promise(resolve => setTimeout(resolve, 50));
            await navigator.clipboard.writeText('');
            toast.success('Clipboard cleared for security.');
        } catch (err) { console.error('Failed to clear clipboard: ', err); } 
        finally { setClipboardClearTimer({ id: null, expiresAt: null }); }
    }, []);

    const copyAndSetTimer = useCallback((password) => {
        if (!password) return;
        navigator.clipboard.writeText(password);
        toast.success('Password copied! Clipboard will clear in 5 minutes.');

        if (clipboardClearTimer.id) clearTimeout(clipboardClearTimer.id);
        
        const expires = Date.now() + 5 * 60 * 1000;
        const timerId = setTimeout(() => handleClearClipboard(), 5 * 60 * 1000);
        
        setClipboardClearTimer({ id: timerId, expiresAt: expires });
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [clipboardClearTimer.id, handleClearClipboard]);

    const handleOptionChange = (e) => {
        const { id, checked } = e.target;
        setOptions(prev => ({ ...prev, [id]: checked }));
    };

    const handleLengthInputChange = (e) => {
        const value = e.target.value;
        if (/^\d*$/.test(value) && value.length < 4) setPasswordLengthInput(value);
    };

    const handleLengthInputBlur = () => {
        let num = parseInt(passwordLengthInput, 10);
        if (isNaN(num) || passwordLengthInput === '') num = 16; 
        if (num < 1) num = 1;
        if (num > 64) num = 64;
        setPasswordLength(num);
        setPasswordLengthInput(String(num));
    };
    
    const handleSliderChange = (e) => {
        const num = parseInt(e.target.value, 10);
        setPasswordLength(num);
        setPasswordLengthInput(String(num));
    };

    const generatePassword = useCallback(() => {
        const { includeLowercase, includeUppercase, includeNumbers, includeSymbols } = options;
        
        let charPool = '';
        const guaranteedChars = [];

        if (includeLowercase) { charPool += CHAR_SETS.lowercase; guaranteedChars.push(CHAR_SETS.lowercase[randomCrypto(CHAR_SETS.lowercase.length)]); }
        if (includeUppercase) { charPool += CHAR_SETS.uppercase; guaranteedChars.push(CHAR_SETS.uppercase[randomCrypto(CHAR_SETS.uppercase.length)]); }
        if (includeNumbers) { charPool += CHAR_SETS.numbers; guaranteedChars.push(CHAR_SETS.numbers[randomCrypto(CHAR_SETS.numbers.length)]); }
        if (includeSymbols) { charPool += CHAR_SETS.symbols; guaranteedChars.push(CHAR_SETS.symbols[randomCrypto(CHAR_SETS.symbols.length)]); }
        
        if (charPool === '') { toast.error('Please select at least one character type.'); return null; }

        const remainingLength = passwordLength - guaranteedChars.length;
        const randomChars = [];

        if(remainingLength > 0){
             for (let i = 0; i < remainingLength; i++) randomChars.push(charPool[randomCrypto(charPool.length)]);
        }
        
        const passwordArray = [...guaranteedChars, ...randomChars].slice(0, passwordLength);
        for (let i = passwordArray.length - 1; i > 0; i--) {
            const j = randomCrypto(i + 1);
            [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
        }
        return passwordArray.join('');
    }, [options, passwordLength]);
    
    const playGenerationAnimation = useCallback((length, finalPassword) => {
        let iteration = 0;
        const interval = setInterval(() => {
            let randomString = '';
            const charPool = CHAR_SETS.lowercase + CHAR_SETS.uppercase + CHAR_SETS.numbers + CHAR_SETS.symbols;
            for (let i = 0; i < length; i++) randomString += charPool[randomCrypto(charPool.length)];
            setDisplayedPassword(randomString);
            
            if (iteration >= 10) {
                clearInterval(interval);
                setDisplayedPassword(finalPassword);
                setGeneratedPassword(finalPassword);
            }
            iteration++;
        }, 20);
    }, []);

    const handleGenerateAndUpdate = useCallback(() => {
        const newPassword = generatePassword();
        
        if (newPassword) {
            if (previousPasswordRef.current !== newPassword) {
                const newHistoryEntry = { password: newPassword, timestamp: new Date(), expiresAt: Date.now() + 10 * 60 * 1000 };
                setPasswordHistory(prev => [newHistoryEntry, ...prev.slice(0, 9)]);
            }
            if (previousPasswordRef.current !== null && newPassword !== previousPasswordRef.current) {
                setGenerationCount(count => count + 1);
            }
            previousPasswordRef.current = newPassword;
            playGenerationAnimation(passwordLength, newPassword);
        } else {
            setDisplayedPassword('');
            setGeneratedPassword('');
            previousPasswordRef.current = '';
        }
        
        setTimeout(() => {
            setSimpleStrength(calculateSimpleStrength(newPassword || ''));
        }, 220);
    }, [generatePassword, passwordLength, playGenerationAnimation]);

    const handleEvaluateUserPassword = () => {
        const passwordToCheck = userPasswordInputRef.current?.value || '';
        setUserStrength(calculateStrengthReport(passwordToCheck));
        setUserSimpleStrength(calculateSimpleStrength(passwordToCheck));
    };

    useEffect(() => {
        handleGenerateAndUpdate();
    }, [handleGenerateAndUpdate]);
    
    useEffect(() => {
        const historyPruner = setInterval(() => {
            const now = Date.now();
            setPasswordHistory(prev => prev.filter(entry => entry.expiresAt > now));
        }, 1000);

        return () => {
            clearInterval(historyPruner);
            if (clipboardClearTimer.id) clearTimeout(clipboardClearTimer.id);
        };
    }, [clipboardClearTimer.id]);

    const handleClearHistory = useCallback(() => {
        setPasswordHistory([]);
        toast.success("Generation history cleared.");
    }, []);

    const strengthColor = (activeView === 'generator' ? simpleStrength?.color : userSimpleStrength?.color) || '#4b5563';

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
            <Toaster position="bottom-center" toastOptions={{
                style: { background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151' },
            }} />
            
             <div className="absolute inset-0 z-0">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] md:w-[600px] h-[80vw] md:h-[600px] rounded-full blur-2xl filter opacity-10" style={{ background: strengthColor, transition: 'background 0.5s ease' }}></div>
            </div>

            <main className="w-full max-w-2xl mx-auto bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-4 sm:p-8 space-y-8 z-10">
                <div className="text-center">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-cyan-400">
                        Password Toolkit
                    </h1>
                    <p className="text-slate-400 mt-2">Generate & evaluate secure passwords with ease.</p>
                </div>

                <div className="flex space-x-1 bg-slate-800/60 p-1 rounded-full">
                    <button onClick={() => setActiveView('generator')} className="relative w-1/2 py-2.5 text-sm font-semibold rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors text-slate-200 hover:text-white">
                        {activeView === 'generator' && <motion.div layoutId="tab-bubble" className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-full" transition={{ type: 'spring', stiffness: 350, damping: 30 }} />}
                        <span className="relative z-10">Generator</span>
                    </button>
                    <button onClick={() => setActiveView('evaluator')} className="relative w-1/2 py-2.5 text-sm font-semibold rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors text-slate-200 hover:text-white">
                        {activeView === 'evaluator' && <motion.div layoutId="tab-bubble" className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-full" transition={{ type: 'spring', stiffness: 350, damping: 30 }} />}
                        <span className="relative z-10">Evaluator</span>
                    </button>
                </div>
                
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeView}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-6"
                    >
                        {activeView === 'generator' ? (
                            <div className="space-y-6">
                                <div>
                                    <div className="relative flex items-center group">
                                        <div className="w-full pl-4 pr-28 font-mono text-xl sm:text-2xl tracking-wider bg-slate-900/70 border-2 border-slate-700 rounded-lg flex items-center h-[68px] overflow-hidden transition-all" style={{borderColor: strengthColor}}>
                                            <div className="flex whitespace-nowrap">
                                                {isPasswordVisible ? (
                                                    Array.from(displayedPassword).map((char, index) => (
                                                        <span key={index} className={`${COLOR_MAP[getCharType(char)] || COLOR_MAP.default} transition-colors`}>{char}</span>
                                                    ))
                                                ) : (
                                                    <span className="text-slate-400">{'•'.repeat(displayedPassword.length)}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="absolute right-2 flex items-center space-x-1 bg-slate-800/50 rounded-lg p-1">
                                            <button onClick={() => setIsPasswordVisible(v => !v)} className="p-2 text-slate-400 hover:text-white transition-colors rounded-md hover:bg-slate-700/50" aria-label="Toggle visibility">
                                                <AnimatePresence mode="wait">
                                                    {isPasswordVisible ? <span key="slash"><EyeSlashIcon className="w-5 h-5" /></span> : <span key="eye"><EyeIcon className="w-5 h-5" /></span>}
                                                </AnimatePresence>
                                            </button>
                                            <button onClick={handleGenerateAndUpdate} className="p-2 text-slate-400 hover:text-white transition-colors rounded-md hover:bg-slate-700/50" aria-label="Regenerate">
                                                <motion.div key={generationCount} animate={{ rotate: 360 }} transition={{ duration: 0.4 }}><GenerateIcon className="w-6 h-6" /></motion.div>
                                            </button>
                                            <button onClick={() => copyAndSetTimer(generatedPassword)} className="p-2 text-slate-400 hover:text-white transition-colors rounded-md hover:bg-slate-700/50" aria-label="Copy password">{copied ? <CheckIcon className="w-5 h-5 text-emerald-400" /> : <ClipboardIcon className="w-5 h-5" />}</button>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center mt-2 px-2">
                                        <span className="text-sm font-medium text-slate-400">Strength</span>
                                        {simpleStrength && <span className="font-bold text-sm" style={{ color: simpleStrength.color }}>{simpleStrength.name}</span>}
                                    </div>
                                </div>
                                <div className="space-y-5">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-4">
                                            <label htmlFor="length-slider" className="text-sm font-medium text-slate-300 whitespace-nowrap">Length: <span className="font-bold text-white">{passwordLength}</span></label>
                                            <input id="length-slider" type="range" min="1" max="64" value={passwordLength} onChange={handleSliderChange} className="w-full range-thumb" />
                                        </div>
                                        <AnimatePresence>
                                            {passwordLength < 12 && (
                                                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2 text-xs text-amber-300 bg-amber-900/20 border-l-4 border-amber-400 px-3 py-1.5 rounded-r-lg">
                                                    <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                                    <span>For better security, a length of 12+ characters is recommended.</span>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <CheckboxOption id="includeUppercase" label="A-Z" checked={options.includeUppercase} onChange={handleOptionChange} colorClass={COLOR_MAP.uppercase} />
                                        <CheckboxOption id="includeLowercase" label="a-z" checked={options.includeLowercase} onChange={handleOptionChange} colorClass={COLOR_MAP.lowercase} />
                                        <CheckboxOption id="includeNumbers" label="0-9" checked={options.includeNumbers} onChange={handleOptionChange} colorClass={COLOR_MAP.numbers} />
                                        <CheckboxOption id="includeSymbols" label="#$%" checked={options.includeSymbols} onChange={handleOptionChange} colorClass={COLOR_MAP.symbols} />
                                    </div>
                                </div>
                                 <div className="space-y-4 pt-2">
                                    <motion.button 
                                        onClick={handleGenerateAndUpdate} 
                                        whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }} 
                                        whileTap={{ scale: 0.98 }} 
                                        className="w-full flex items-center justify-center bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-semibold py-3 px-4 rounded-lg shadow-lg shadow-cyan-500/10 transition-all">
                                        <GenerateIcon className="w-6 h-6 mr-2" />
                                        Generate New Password
                                    </motion.button>
                                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <motion.button 
                                            onClick={() => copyAndSetTimer(generatedPassword)} 
                                            disabled={!generatedPassword} 
                                            whileHover={{ scale: 1.02 }} 
                                            whileTap={{ scale: 0.98 }} 
                                            className="w-full flex items-center justify-center bg-slate-700/60 hover:bg-slate-700 border border-slate-600/80 text-slate-200 font-semibold py-3 px-4 rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                                            <ClipboardIcon className="w-5 h-5 mr-2" />
                                            Copy Password
                                        </motion.button>
                                        <motion.button 
                                            onClick={() => setIsHistoryModalOpen(true)} 
                                            disabled={passwordHistory.length === 0} 
                                            whileHover={{ scale: 1.02 }} 
                                            whileTap={{ scale: 0.98 }} 
                                            className="w-full flex items-center justify-center bg-slate-700/60 hover:bg-slate-700 border border-slate-600/80 text-slate-200 font-semibold py-3 px-4 rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                                            <HistoryIcon className="w-5 h-5 mr-2" />
                                            History
                                        </motion.button>
                                     </div>
                                    {clipboardClearTimer.expiresAt && 
                                        <motion.button 
                                            onClick={handleClearClipboard} 
                                            whileHover={{ scale: 1.02 }} 
                                            whileTap={{ scale: 0.98 }} 
                                            className="w-full flex items-center justify-center bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-semibold py-3 px-4 rounded-lg shadow-md">
                                            <TrashIcon className="w-5 h-5 mr-2" />
                                            Clear Clipboard
                                            <CountdownTimer expiresAt={clipboardClearTimer.expiresAt} className="ml-1.5" />
                                        </motion.button>
                                    }
                                </div>
                            </div>
                        ) : (
                           <div className="space-y-4">
                                <div>
                                    <label htmlFor="evaluator-input" className="sr-only">Password to evaluate</label>
                                    <input ref={userPasswordInputRef} id="evaluator-input" type="text" onChange={handleEvaluateUserPassword} placeholder="Type or paste a password..." className="w-full p-4 font-mono bg-slate-900/70 border-2 border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors" style={{borderColor: strengthColor}} aria-label="Password to evaluate" />
                                    <div className="flex justify-end items-center mt-2 px-2">
                                        {userSimpleStrength && <span className="font-bold text-sm" style={{ color: userSimpleStrength.color }}>{userSimpleStrength.name}</span>}
                                    </div>
                                </div>
                                {userPasswordInputRef.current?.value && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                        <StrengthReport report={userStrength} />
                                    </motion.div>
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </main>
            
            <AnimatePresence>
                {isHistoryModalOpen && (
                    <HistoryModal onClose={() => setIsHistoryModalOpen(false)} history={passwordHistory} onClearHistory={handleClearHistory} onCopy={copyAndSetTimer} />
                )}
            </AnimatePresence>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<PasswordToolkit />);