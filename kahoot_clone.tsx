import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, deleteDoc, addDoc } from 'firebase/firestore';

// --- Firebase Initialization ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-kahoot-clone';

// --- Constants & Themes ---
const COLORS = [
  'bg-red-500 hover:bg-red-600',
  'bg-blue-500 hover:bg-blue-600',
  'bg-yellow-500 hover:bg-yellow-600',
  'bg-green-500 hover:bg-green-600'
];

const SHAPES = ['▲', '◆', '●', '■'];

// --- Icons (Inline SVGs) ---
const IconTrophy = () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>;
const IconUsers = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
const IconPlay = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconImage = () => <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
const IconCheck = () => <svg className="w-16 h-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M5 13l4 4L19 7" /></svg>;
const IconX = () => <svg className="w-16 h-16 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M6 18L18 6M6 6l12 12" /></svg>;

// ==========================================
// UTILS
// ==========================================
const generatePIN = () => Math.floor(10000 + Math.random() * 90000).toString();

const calculateScores = (roomData) => {
  if (!roomData || !roomData.players) return [];
  const playersArr = Object.entries(roomData.players).map(([id, p]) => {
    let score = 0;
    roomData.quiz.questions.forEach((q, idx) => {
      if (p.answers && p.answers[idx] === q.correctAnswer) {
        score += 1000; // Pontuação base por acerto
      }
    });
    return { id, ...p, score };
  });
  return playersArr.sort((a, b) => b.score - a.score);
};

// ==========================================
// STUDENT APP
// ==========================================
const StudentApp = ({ user, goBack }) => {
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [room, setRoom] = useState(null);
  const [step, setStep] = useState('pin'); // pin -> name -> lobby -> game
  const [error, setError] = useState('');
  const [hasAnsweredCurrent, setHasAnsweredCurrent] = useState(false);

  useEffect(() => {
    if (step === 'lobby' || step === 'game') {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', pin);
      const unsub = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setRoom(data);
          
          if (data.status === 'playing') setStep('game');
          if (data.status === 'finished') setStep('pin'); // Volta ao inicio se fechar

          // Reset local answered state if question changes
          const myAnswer = data.players[user.uid]?.answers?.[data.currentQuestionIndex];
          setHasAnsweredCurrent(myAnswer !== undefined);

        } else {
          setError('A sala foi fechada.');
          setStep('pin');
          setRoom(null);
        }
      }, (err) => {
        console.error(err);
        setError('Erro de conexão.');
      });
      return () => unsub();
    }
  }, [step, pin, user.uid]);

  const handleJoinPin = async (e) => {
    e.preventDefault();
    setError('');
    if (pin.length !== 5) return setError('O PIN deve ter 5 dígitos.');
    
    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', pin);
      const snap = await getDoc(roomRef);
      if (snap.exists() && snap.data().status === 'waiting') {
        setStep('name');
      } else {
        setError('Sala não encontrada ou já em andamento.');
      }
    } catch (err) {
      setError('Erro ao buscar sala.');
    }
  };

  const handleJoinName = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Digite um nome.');

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', pin);
      await setDoc(roomRef, {
        players: {
          [user.uid]: { name, answers: {} }
        }
      }, { merge: true });
      setStep('lobby');
    } catch (err) {
      setError('Erro ao entrar na sala.');
    }
  };

  const handleAnswer = async (optionIndex) => {
    if (hasAnsweredCurrent || room.gameState !== 'question') return;
    setHasAnsweredCurrent(true);
    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', pin);
      await updateDoc(roomRef, {
        [`players.${user.uid}.answers.${room.currentQuestionIndex}`]: optionIndex
      });
    } catch (err) {
      console.error(err);
      setHasAnsweredCurrent(false);
    }
  };

  // Views
  if (step === 'pin') {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <button onClick={goBack} className="absolute top-4 left-4 text-gray-500 font-bold hover:text-gray-800">Voltar</button>
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm text-center">
          <h1 className="text-4xl font-extrabold text-purple-600 mb-8">Quiz App</h1>
          <form onSubmit={handleJoinPin} className="space-y-4">
            <input 
              type="text" 
              placeholder="PIN do Jogo" 
              className="w-full text-center text-3xl font-bold p-4 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0,5))}
            />
            <button type="submit" className="w-full bg-gray-900 text-white font-bold text-xl py-4 rounded-lg hover:bg-gray-800 transition-colors">
              Entrar
            </button>
          </form>
          {error && <p className="text-red-500 mt-4 font-semibold">{error}</p>}
        </div>
      </div>
    );
  }

  if (step === 'name') {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
         <button onClick={() => setStep('pin')} className="absolute top-4 left-4 text-gray-500 font-bold hover:text-gray-800">Voltar</button>
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Seu Nome</h1>
          <form onSubmit={handleJoinName} className="space-y-4">
            <input 
              type="text" 
              placeholder="Apelido" 
              className="w-full text-center text-2xl font-bold p-4 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={15}
            />
            <button type="submit" className="w-full bg-purple-600 text-white font-bold text-xl py-4 rounded-lg hover:bg-purple-700 transition-colors">
              Pronto, vamos lá!
            </button>
          </form>
          {error && <p className="text-red-500 mt-4 font-semibold">{error}</p>}
        </div>
      </div>
    );
  }

  if (step === 'lobby') {
    return (
      <div className="min-h-screen bg-purple-600 flex flex-col items-center justify-center p-4">
        <h1 className="text-4xl font-extrabold text-white mb-4">Você está dentro!</h1>
        <p className="text-xl text-purple-200">Veja seu nome na tela do professor.</p>
        <div className="mt-8 animate-pulse text-white font-bold text-2xl">Aguardando início...</div>
      </div>
    );
  }

  if (step === 'game' && room) {
    const qIndex = room.currentQuestionIndex;
    const isRevealed = room.gameState === 'revealed';
    const isLeaderboard = room.gameState === 'leaderboard';
    const isWaitingReveal = room.gameState === 'waiting_reveal';
    const myAnswer = room.players[user.uid]?.answers?.[qIndex];
    const correctAnswer = room.quiz.questions[qIndex]?.correctAnswer;

    if (isLeaderboard) {
      const scores = calculateScores(room);
      const myRank = scores.findIndex(p => p.id === user.uid) + 1;
      return (
        <div className="min-h-screen bg-purple-700 flex flex-col items-center justify-center p-4">
           <h1 className="text-3xl text-white font-bold mb-4">Ranking Parcial</h1>
           <div className="bg-white p-6 rounded-xl shadow-lg text-center w-full max-w-sm">
              <p className="text-gray-500 uppercase font-bold text-sm tracking-wider">Sua Posição</p>
              <p className="text-6xl font-extrabold text-purple-600 my-4">#{myRank}</p>
              <p className="text-xl text-gray-700 font-bold">{scores[myRank-1]?.score} Pontos</p>
           </div>
           <div className="mt-8 animate-pulse text-white">Aguardando próxima pergunta...</div>
        </div>
      );
    }

    if (isRevealed) {
      const gotItRight = myAnswer === correctAnswer;
      return (
        <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors ${gotItRight ? 'bg-green-500' : 'bg-red-500'}`}>
          {gotItRight ? <IconCheck /> : <IconX />}
          <h1 className="text-4xl font-extrabold text-white mt-4">{gotItRight ? 'Correto!' : 'Incorreto!'}</h1>
          <p className="text-white mt-2 text-xl">{gotItRight ? '+1000 pontos' : 'Na próxima você consegue!'}</p>
        </div>
      );
    }

    if (isWaitingReveal || (hasAnsweredCurrent && room.gameState === 'question')) {
      return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500 mb-6"></div>
          <h2 className="text-2xl font-bold text-gray-700 text-center px-4">
            {isWaitingReveal ? 'Tempo esgotado! Aguardando a professora...' : 'Aguardando os outros jogadores...'}
          </h2>
        </div>
      );
    }

    // Showing question buttons
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col p-2 h-screen">
        <div className="grid grid-cols-2 grid-rows-2 gap-2 flex-grow">
          {room.quiz.questions[qIndex].options.map((_, idx) => (
            <button 
              key={idx}
              onClick={() => handleAnswer(idx)}
              className={`${COLORS[idx]} w-full h-full rounded-xl shadow-sm flex items-center justify-center active:scale-95 transition-transform`}
            >
              <span className="text-white text-6xl shadow-sm drop-shadow-md">{SHAPES[idx]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

// ==========================================
// TEACHER APP
// ==========================================
const TeacherApp = ({ user, goBack }) => {
  const [view, setView] = useState('dashboard'); // dashboard, editor, lobby, game
  const [quizzes, setQuizzes] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null); // For editor
  const [pin, setPin] = useState(null); // Active room PIN
  const [room, setRoom] = useState(null);
  
  // Dashboard logic
  useEffect(() => {
    if (!user) return;
    const qRef = collection(db, 'artifacts', appId, 'users', user.uid, 'quizzes');
    const unsub = onSnapshot(qRef, (snap) => {
      const qList = [];
      snap.forEach(doc => qList.push({ id: doc.id, ...doc.data() }));
      setQuizzes(qList);
    }, (err) => console.error("Error fetching quizzes:", err));
    return () => unsub();
  }, [user]);

  // Active Room Logic
  useEffect(() => {
    if (pin && (view === 'lobby' || view === 'game')) {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', pin);
      const unsub = onSnapshot(roomRef, (snap) => {
        if (snap.exists()) setRoom(snap.data());
      });
      return () => unsub();
    }
  }, [pin, view]);

  const handleCreateQuiz = () => {
    setActiveQuiz({ title: 'Novo Quiz', questions: [{ text: '', imageUrl: '', options: ['', '', '', ''], correctAnswer: 0 }] });
    setView('editor');
  };

  const handleEditQuiz = (quiz) => {
    setActiveQuiz(quiz);
    setView('editor');
  };

  const handleSaveQuiz = async (quiz) => {
    try {
      const qRef = collection(db, 'artifacts', appId, 'users', user.uid, 'quizzes');
      if (quiz.id) {
        await updateDoc(doc(qRef, quiz.id), quiz);
      } else {
        await addDoc(qRef, quiz);
      }
      setView('dashboard');
    } catch (e) {
      console.error("Error saving quiz", e);
    }
  };

  const handleDeleteQuiz = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'quizzes', id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleHostQuiz = async (quiz) => {
    const newPin = generatePIN();
    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', newPin);
      await setDoc(roomRef, {
        pin: newPin,
        hostId: user.uid,
        status: 'waiting',
        currentQuestionIndex: 0,
        gameState: 'question', // question, waiting_reveal, revealed, leaderboard
        timeLeft: 15,
        quiz: quiz,
        players: {}
      });
      setPin(newPin);
      setView('lobby');
    } catch (e) {
      console.error("Error hosting", e);
    }
  };

  const changeGameState = async (updates) => {
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', pin);
    await updateDoc(roomRef, updates);
  };

  const endGame = async () => {
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', pin);
    await updateDoc(roomRef, { status: 'finished' });
    setPin(null);
    setRoom(null);
    setView('dashboard');
  };

  // Timer Effect
  useEffect(() => {
    if (view === 'game' && room?.gameState === 'question' && room?.timeLeft !== undefined) {
      const qIndex = room.currentQuestionIndex;
      const totalPlayers = Object.keys(room.players || {}).length;
      const answersCount = Object.values(room.players || {}).filter(p => p.answers && p.answers[qIndex] !== undefined).length;

      if (room.timeLeft > 0) {
        const timer = setTimeout(() => {
          if (totalPlayers > 0 && answersCount >= totalPlayers) {
            changeGameState({ gameState: 'waiting_reveal' });
          } else {
            changeGameState({ timeLeft: room.timeLeft - 1 });
          }
        }, 1000);
        return () => clearTimeout(timer);
      } else if (room.timeLeft === 0) {
        changeGameState({ gameState: 'waiting_reveal' });
      }
    }
  }, [view, room, pin]);

  // Views
  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-50 p-6 md:p-12">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-extrabold text-gray-800">Painel do Professor</h1>
            <div className="flex gap-4">
              <button onClick={handleCreateQuiz} className="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-purple-700 transition">
                + Criar Quiz
              </button>
              <button onClick={goBack} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-300 transition">
                Sair
              </button>
            </div>
          </div>

          {quizzes.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl shadow-sm border border-gray-100">
              <p className="text-gray-500 text-lg">Você ainda não tem nenhum quiz. Crie um para começar!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quizzes.map(q => (
                <div key={q.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                  <h3 className="text-xl font-bold text-gray-800 mb-2">{q.title}</h3>
                  <p className="text-gray-500 mb-6">{q.questions?.length || 0} perguntas</p>
                  
                  <div className="mt-auto flex justify-between gap-2">
                    <button onClick={() => handleHostQuiz(q)} className="flex-1 bg-green-500 text-white py-2 rounded font-bold hover:bg-green-600 transition flex items-center justify-center gap-2">
                      <IconPlay /> Jogar
                    </button>
                    <button onClick={() => handleEditQuiz(q)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded font-semibold hover:bg-gray-200 transition">
                      Editar
                    </button>
                    <button onClick={() => handleDeleteQuiz(q.id)} className="px-4 py-2 bg-red-100 text-red-600 rounded font-semibold hover:bg-red-200 transition">
                      X
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'editor' && activeQuiz) {
    return <QuizEditor quiz={activeQuiz} onSave={handleSaveQuiz} onCancel={() => setView('dashboard')} />;
  }

  if (view === 'lobby' && room) {
    const players = Object.values(room.players || {});
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col p-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-3xl mx-auto w-full">
          <h2 className="text-2xl font-bold text-gray-500 uppercase tracking-wider mb-2">Código da Sala</h2>
          <div className="text-7xl font-black text-gray-900 tracking-widest mb-8">{pin}</div>
          
          <div className="flex items-center justify-center gap-4 mb-8">
            <IconUsers />
            <span className="text-2xl font-bold text-gray-700">{players.length} Jogadores na sala</span>
          </div>

          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {players.map((p, i) => (
              <span key={i} className="bg-purple-100 text-purple-800 px-4 py-2 rounded-full font-bold text-lg animate-bounce">
                {p.name}
              </span>
            ))}
          </div>

          <div className="flex justify-center gap-4">
             <button 
              onClick={() => changeGameState({ status: 'playing' }).then(() => setView('game'))}
              disabled={players.length === 0}
              className={`px-12 py-4 rounded-full font-black text-2xl text-white transition-all ${players.length > 0 ? 'bg-purple-600 hover:bg-purple-700 hover:scale-105' : 'bg-gray-400 cursor-not-allowed'}`}
            >
              Iniciar Jogo
            </button>
            <button onClick={endGame} className="px-8 py-4 bg-gray-200 text-gray-700 rounded-full font-bold hover:bg-gray-300">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'game' && room) {
    const qIndex = room.currentQuestionIndex;
    const question = room.quiz.questions[qIndex];
    const totalPlayers = Object.keys(room.players || {}).length;
    const answersCount = Object.values(room.players || {}).filter(p => p.answers && p.answers[qIndex] !== undefined).length;

    if (room.gameState === 'leaderboard') {
      const scores = calculateScores(room).slice(0, 5); // Top 5
      return (
        <div className="min-h-screen bg-purple-700 flex flex-col p-8">
          <h1 className="text-5xl font-black text-white text-center mb-12 flex items-center justify-center gap-4">
             <IconTrophy /> Ranking <IconTrophy />
          </h1>
          <div className="max-w-2xl mx-auto w-full space-y-4">
            {scores.map((p, i) => (
              <div key={p.id} className="bg-white rounded-xl p-4 flex justify-between items-center shadow-lg transform transition-transform hover:scale-105">
                 <div className="flex items-center gap-4">
                   <span className="text-3xl font-black text-purple-600 w-8 text-center">{i+1}</span>
                   <span className="text-2xl font-bold text-gray-800">{p.name}</span>
                 </div>
                 <span className="text-2xl font-bold text-gray-500">{p.score} pts</span>
              </div>
            ))}
          </div>

          <div className="mt-auto flex justify-center pt-12">
            {qIndex < room.quiz.questions.length - 1 ? (
               <button 
                 onClick={() => changeGameState({ gameState: 'question', currentQuestionIndex: qIndex + 1, timeLeft: 15 })}
                 className="bg-blue-500 text-white px-12 py-4 rounded-full font-black text-2xl hover:bg-blue-600 shadow-xl"
               >
                 Próxima Pergunta
               </button>
            ) : (
               <button 
                 onClick={endGame}
                 className="bg-gray-900 text-white px-12 py-4 rounded-full font-black text-2xl hover:bg-gray-800 shadow-xl"
               >
                 Finalizar Sala
               </button>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-gray-100 flex flex-col p-4 md:p-8">
        <div className="flex justify-between items-center mb-6">
           <span className="bg-white px-6 py-2 rounded-full shadow font-bold text-gray-600">
             Pergunta {qIndex + 1} de {room.quiz.questions.length}
           </span>
           
           {room.gameState === 'question' && (
             <span className="bg-red-100 text-red-600 px-6 py-2 rounded-full shadow font-black text-2xl animate-pulse border-2 border-red-500">
               {room.timeLeft}s
             </span>
           )}

           <span className="bg-white px-6 py-2 rounded-full shadow font-bold text-purple-600 text-xl">
             PIN: {pin}
           </span>
           <span className="bg-white px-6 py-2 rounded-full shadow font-bold text-gray-600">
             Respostas: {answersCount} / {totalPlayers}
           </span>
        </div>

        <div className="bg-white rounded-2xl shadow p-8 text-center flex-grow flex flex-col items-center justify-center mb-8">
           <h2 className="text-4xl font-extrabold text-gray-800 mb-8">{question.text}</h2>
           
           {question.imageUrl ? (
             <div className="w-full max-w-2xl max-h-64 flex-grow rounded-xl overflow-hidden shadow-inner bg-gray-100 flex items-center justify-center mb-8">
               <img src={question.imageUrl} alt="Lâmina/Ilustração" className="w-full h-full object-contain" onError={(e) => e.target.style.display = 'none'} />
             </div>
           ) : (
             <div className="w-full max-w-2xl max-h-64 flex-grow rounded-xl bg-gray-100 flex items-center justify-center mb-8">
                <IconImage />
             </div>
           )}

           {room.gameState === 'waiting_reveal' && (
              <button 
                onClick={() => changeGameState({ gameState: 'revealed' })}
                className="bg-purple-600 text-white px-8 py-3 rounded-full font-bold text-xl hover:bg-purple-700 mt-4 shadow-lg transition-transform hover:scale-105"
              >
                Revelar Resposta
              </button>
           )}
           {room.gameState === 'revealed' && (
              <button 
                onClick={() => changeGameState({ gameState: 'leaderboard' })}
                className="bg-blue-500 text-white px-8 py-3 rounded-full font-bold text-xl hover:bg-blue-600 mt-4 shadow-lg transition-transform hover:scale-105"
              >
                Ver Ranking
              </button>
           )}
        </div>

        <div className="grid grid-cols-2 gap-4">
           {question.options.map((opt, idx) => {
             const isRevealed = room.gameState === 'revealed';
             const isCorrect = idx === question.correctAnswer;
             const opacityClass = isRevealed && !isCorrect ? 'opacity-30' : 'opacity-100';
             
             return (
              <div key={idx} className={`${COLORS[idx].split(' ')[0]} ${opacityClass} rounded-xl p-6 shadow-md flex items-center gap-4 transition-opacity duration-500`}>
                 <span className="text-white text-4xl drop-shadow">{SHAPES[idx]}</span>
                 <span className="text-white text-2xl font-bold">{opt}</span>
                 {isRevealed && isCorrect && <span className="ml-auto text-white"><IconCheck /></span>}
              </div>
             )
           })}
        </div>
      </div>
    );
  }

  return null;
};

// ==========================================
// QUIZ EDITOR COMPONENT
// ==========================================
const QuizEditor = ({ quiz, onSave, onCancel }) => {
  const [localQuiz, setLocalQuiz] = useState(JSON.parse(JSON.stringify(quiz)));
  const [currentQIndex, setCurrentQIndex] = useState(0);

  const updateTitle = (e) => setLocalQuiz({...localQuiz, title: e.target.value});
  
  const updateQuestion = (field, value) => {
    const qs = [...localQuiz.questions];
    qs[currentQIndex][field] = value;
    setLocalQuiz({...localQuiz, questions: qs});
  };

  const updateOption = (idx, value) => {
    const qs = [...localQuiz.questions];
    qs[currentQIndex].options[idx] = value;
    setLocalQuiz({...localQuiz, questions: qs});
  };

  const addQuestion = () => {
    setLocalQuiz({
      ...localQuiz,
      questions: [...localQuiz.questions, { text: '', imageUrl: '', options: ['', '', '', ''], correctAnswer: 0 }]
    });
    setCurrentQIndex(localQuiz.questions.length);
  };

  const removeQuestion = (idx) => {
    if (localQuiz.questions.length === 1) return;
    const qs = localQuiz.questions.filter((_, i) => i !== idx);
    setLocalQuiz({...localQuiz, questions: qs});
    setCurrentQIndex(Math.max(0, currentQIndex - 1));
  };

  const handleSave = () => {
    // Validate empty fields minimally
    if (!localQuiz.title.trim()) localQuiz.title = 'Quiz sem título';
    onSave(localQuiz);
  };

  const currentQ = localQuiz.questions[currentQIndex];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b p-4 flex justify-between items-center shadow-sm z-10">
        <input 
          type="text" 
          className="text-2xl font-bold bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-purple-500 focus:outline-none px-2 py-1 w-1/3"
          value={localQuiz.title}
          onChange={updateTitle}
          placeholder="Título do Quiz"
        />
        <div className="flex gap-4">
          <button onClick={onCancel} className="px-4 py-2 font-semibold text-gray-500 hover:bg-gray-100 rounded">Cancelar</button>
          <button onClick={handleSave} className="px-6 py-2 bg-green-500 text-white font-bold rounded shadow hover:bg-green-600 transition">Salvar Quiz</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r overflow-y-auto p-4 flex flex-col gap-2 shadow-sm">
          {localQuiz.questions.map((q, i) => (
             <div 
               key={i} 
               onClick={() => setCurrentQIndex(i)}
               className={`p-3 rounded cursor-pointer border ${currentQIndex === i ? 'bg-purple-50 border-purple-300' : 'hover:bg-gray-50 border-transparent'}`}
             >
               <div className="font-bold text-gray-700 mb-1 flex justify-between">
                 <span>{i+1}. Pergunta</span>
                 {localQuiz.questions.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); removeQuestion(i); }} className="text-red-400 hover:text-red-600 p-1 bg-white rounded shadow-sm leading-none">x</button>
                 )}
               </div>
               <div className="text-xs text-gray-500 truncate">{q.text || 'Sem texto...'}</div>
             </div>
          ))}
          <button onClick={addQuestion} className="mt-4 p-3 bg-gray-100 text-gray-700 font-bold rounded hover:bg-gray-200 flex items-center justify-center gap-2">
            + Adicionar
          </button>
        </div>

        {/* Editor Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-100">
           <div className="max-w-4xl mx-auto space-y-6">
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <label className="block text-gray-700 font-bold mb-2">Pergunta</label>
                <input 
                  className="w-full text-xl p-3 border rounded focus:border-purple-500 focus:outline-none" 
                  value={currentQ.text} 
                  onChange={(e) => updateQuestion('text', e.target.value)}
                  placeholder="Digite a pergunta aqui..."
                />
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <label className="block text-gray-700 font-bold mb-2">URL da Imagem/Lâmina (Opcional)</label>
                <div className="flex gap-4">
                  <input 
                    className="flex-1 p-3 border rounded focus:border-purple-500 focus:outline-none text-sm" 
                    value={currentQ.imageUrl} 
                    onChange={(e) => updateQuestion('imageUrl', e.target.value)}
                    placeholder="https://exemplo.com/imagem.png"
                  />
                </div>
                {currentQ.imageUrl && (
                  <div className="mt-4 h-48 bg-gray-100 rounded border flex items-center justify-center overflow-hidden">
                    <img src={currentQ.imageUrl} alt="Preview" className="max-h-full max-w-full object-contain" onError={(e) => e.target.style.display='none'} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {currentQ.options.map((opt, idx) => (
                  <div key={idx} className={`${COLORS[idx].split(' ')[0]} rounded-xl p-4 flex flex-col gap-2 relative shadow-md`}>
                    <div className="flex justify-between items-center">
                       <span className="text-white font-bold drop-shadow flex items-center gap-2">
                         <span className="text-2xl">{SHAPES[idx]}</span>
                         Alternativa {idx + 1}
                       </span>
                       <label className="flex items-center gap-2 bg-white/20 p-2 rounded cursor-pointer hover:bg-white/30 transition">
                         <input 
                           type="radio" 
                           name={`correct-${currentQIndex}`} 
                           className="w-5 h-5 accent-green-400"
                           checked={currentQ.correctAnswer === idx}
                           onChange={() => updateQuestion('correctAnswer', idx)}
                         />
                         <span className="text-white font-bold text-sm">Correta</span>
                       </label>
                    </div>
                    <textarea 
                      className="w-full bg-white/90 rounded p-3 font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-white h-24 resize-none"
                      value={opt}
                      onChange={(e) => updateOption(idx, e.target.value)}
                      placeholder={`Resposta ${idx + 1}...`}
                    />
                  </div>
                ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// MAIN APP COMPONENT
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'student' | 'teacher' | null
  const [loading, setLoading] = useState(true);

  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const TEACHER_PASSWORD = 'admin123'; // Senha do professor definida aqui

  // Authentication Flow
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-purple-600"></div></div>;
  }

  const handleTeacherSelect = () => {
    setShowPasswordPrompt(true);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === TEACHER_PASSWORD) {
      setShowPasswordPrompt(false);
      setPasswordInput('');
      setPasswordError('');
      setRole('teacher');
    } else {
      setPasswordError('Senha incorreta!');
    }
  };

  if (showPasswordPrompt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full text-center relative">
          <button onClick={() => setShowPasswordPrompt(false)} className="absolute top-4 left-4 text-gray-400 hover:text-gray-800 font-bold">Voltar</button>
          <h2 className="text-2xl font-bold text-gray-800 mb-6 mt-4">Acesso de Professor</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input 
              type="password" 
              placeholder="Digite a senha" 
              className="w-full text-center text-xl p-3 border-2 border-gray-300 rounded focus:border-purple-500 focus:outline-none"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
            />
            <button type="submit" className="w-full bg-purple-600 text-white font-bold text-lg py-3 rounded hover:bg-purple-700 transition">Entrar</button>
          </form>
          {passwordError && <p className="text-red-500 mt-4 font-semibold">{passwordError}</p>}
        </div>
      </div>
    );
  }

  // Routing based on Role Selection
  if (!role) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-16 max-w-2xl w-full text-center">
          <h1 className="text-5xl font-black text-gray-800 mb-4 tracking-tight">QuizApp</h1>
          <p className="text-gray-500 text-xl mb-12">Escolha como você deseja acessar</p>
          
          <div className="grid md:grid-cols-2 gap-6">
            <button 
              onClick={handleTeacherSelect}
              className="group flex flex-col items-center justify-center p-8 bg-purple-50 rounded-2xl border-2 border-purple-100 hover:border-purple-500 hover:shadow-lg transition-all"
            >
              <div className="w-20 h-20 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Professor</h2>
              <p className="text-gray-500 mt-2 text-sm">Criar e apresentar quizzes</p>
            </button>

            <button 
              onClick={() => setRole('student')}
              className="group flex flex-col items-center justify-center p-8 bg-blue-50 rounded-2xl border-2 border-blue-100 hover:border-blue-500 hover:shadow-lg transition-all"
            >
              <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Aluno</h2>
              <p className="text-gray-500 mt-2 text-sm">Entrar com o PIN e jogar</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const goBack = () => setRole(null);

  return role === 'teacher' ? (
    <TeacherApp user={user} goBack={goBack} />
  ) : (
    <StudentApp user={user} goBack={goBack} />
  );
}