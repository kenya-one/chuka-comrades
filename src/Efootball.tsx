
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Gamepad2, Users, Trophy, MessageCircle, RefreshCw, ShoppingBag, X, LockKeyhole } from 'lucide-react';
import { supabase } from './lib/supabase';
import { efootballAction, uploadEfootballImage } from './lib/efootballApi';
import type { User } from 'firebase/auth';
import './Efootball.css';

type Player = {
  id: string;
  username: string;
  squad_image_url: string | null;
  market_image_url?: string | null;
  listing_type: 'player' | 'sell' | 'buy';
  asking_price: number | null;
  description: string | null;
  created_at: string;
  status: string;
};

type Tournament = {
  id: string;
  name: string;
  poster_url: string | null;
  max_members: number;
  status: string;
  winner: string | null;
  created_at: string;
};

type TournamentDetails = {
  room_number: string;
  instructions: string | null;
};

const ADMIN_WA = '254180752220';
const TILL = '6817863';

export default function Efootball({
  user,
  onSignIn
}: {
  user: User | null;
  onSignIn: () => void;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [market, setMarket] = useState<Player[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  const [tab, setTab] = useState<'players' | 'market' | 'tournaments'>('players');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const [isMember, setIsMember] = useState(false);
  const [tournamentDetails, setTournamentDetails] = useState<
    Record<string, TournamentDetails>
  >({});

  const [showRegister, setShowRegister] = useState(false);
  const [showTournament, setShowTournament] = useState(false);
  const [showMarket, setShowMarket] = useState(false);

  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [mpesa, setMpesa] = useState('');
  const [squad, setSquad] = useState<File | null>(null);

  const [marketType, setMarketType] = useState<'sell' | 'buy'>('sell');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [marketImage, setMarketImage] = useState<File | null>(null);

  const [tName, setTName] = useState('');
  const [tMax, setTMax] = useState('16');
  const [room, setRoom] = useState('');
  const [tInstructions, setTInstructions] = useState('');
  const [poster, setPoster] = useState<File | null>(null);

  const refresh = async () => {
    if (!supabase) {
      setNotice('Connect Supabase to enable live player listings and tournaments.');
      return;
    }

    setLoading(true);

    const [p, m, t] = await Promise.all([
      supabase
        .from('efootball_public_listings')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false }),

      supabase
        .from('efootball_market_public')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false }),

      supabase
        .from('efootball_tournaments_public')
        .select('*')
        .in('status', ['open', 'full'])
        .order('created_at', { ascending: false })
    ]);

    if (p.error || m.error || t.error) {
      setNotice('Could not load Efootball data. Check the Supabase setup guide.');
    } else {
      setPlayers((p.data || []) as Player[]);
      setMarket((m.data || []) as Player[]);
      setTournaments((t.data || []) as Tournament[]);
      setNotice('');
    }

    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    let active = true;

    if (!user) {
      setIsMember(false);
      setTournamentDetails({});
      return;
    }

    void efootballAction<{ is_member: boolean }>(user, {
      action: 'check_member'
    })
      .then(result => {
        if (active) {
          setIsMember(result.is_member);

          if (!result.is_member) {
            setTournamentDetails({});
          }
        }
      })
      .catch(() => {
        if (active) {
          setIsMember(false);
          setTournamentDetails({});
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  const openWhatsApp = (text: string) => {
    window.open(
      `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const showTournamentDetails = async (tournamentId: string) => {
    if (!user) {
      onSignIn();
      return;
    }

    if (!isMember) {
      setNotice('Approved Efootball membership is required to view tournament room details.');
      return;
    }

    if (tournamentDetails[tournamentId]) {
      return;
    }

    setLoading(true);

    try {
      const details = await efootballAction<TournamentDetails>(user, {
        action: 'get_tournament_details',
        tournament_id: tournamentId
      });

      setTournamentDetails(current => ({
        ...current,
        [tournamentId]: details
      }));

      setNotice('Tournament room details loaded for your approved membership.');
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : 'Could not load tournament room details.'
      );
    } finally {
      setLoading(false);
    }
  };

  const submitPlayer = async () => {
    if (!user) {
      onSignIn();
      return;
    }

    if (!username.trim() || !phone.trim() || !mpesa.trim() || !squad) {
      setNotice('Complete all fields, upload your squad image and enter the M-Pesa transaction code.');
      return;
    }

    setLoading(true);

    try {
      const image = await uploadEfootballImage(user, squad, 'players');

      const data = await efootballAction<{ id: string }>(user, {
        action: 'submit_player',
        username: username.trim(),
        whatsapp: phone.trim(),
        mpesa_code: mpesa.trim().toUpperCase(),
        squad_image_url: image
      });

      openWhatsApp(`CHUKA EFOOTBALL — KSh 30 PLAYER LISTING PAYMENT VERIFICATION
Submission ID: ${data.id}
Player username: ${username}
Player WhatsApp: ${phone}
M-Pesa transaction code: ${mpesa.trim().toUpperCase()}
Amount paid: KSh 30
Paid to Till: ${TILL}
Squad image: ${image}
Please verify this transaction against the Till statement and approve/reject my listing.`);

      setShowRegister(false);
      setNotice('Submission saved as pending. WhatsApp admin with the details and wait for approval.');

      setUsername('');
      setPhone('');
      setMpesa('');
      setSquad(null);
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : 'Could not submit player profile.'
      );
    } finally {
      setLoading(false);
    }
  };

  const submitMarket = async () => {
    if (!user) {
      onSignIn();
      return;
    }

    if (!username.trim() || !description.trim()) {
      setNotice('Enter an eFootball username and describe the account.');
      return;
    }

    if (
      price.trim() &&
      (!Number.isFinite(Number(price)) || Number(price) < 0)
    ) {
      setNotice('Enter a valid asking price.');
      return;
    }

    setLoading(true);

    try {
      const imageUrl = marketImage
        ? await uploadEfootballImage(user, marketImage, 'market')
        : null;

      const data = await efootballAction<{ id: string }>(user, {
        action: 'submit_market',
        username: username.trim(),
        listing_type: marketType,
        asking_price: price.trim() ? Number(price) : null,
        description: description.trim(),
        market_image_url: imageUrl
      });

      openWhatsApp(`CHUKA EFOOTBALL — ACCOUNT ${marketType.toUpperCase()} LISTING
Submission: ${data.id}
Username: ${username}
Price: ${price || 'Negotiable'}
Description: ${description}
Image: ${imageUrl || 'Not supplied'}
Please review this listing.`);

      setShowMarket(false);
      setMarketImage(null);
      setNotice('Account listing sent for admin approval. An approved player registration is required. Contact details remain private.');
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : 'Could not submit account listing.'
      );
    } finally {
      setLoading(false);
    }
  };

  const submitTournament = async () => {
    if (!user) {
      onSignIn();
      return;
    }

    if (!isMember) {
      setNotice('Only approved Efootball members can submit tournaments.');
      setShowTournament(false);
      return;
    }

    if (!tName.trim() || !room.trim() || !poster || Number(tMax) < 2) {
      setNotice('Add tournament name, poster, room number and a maximum of at least 2 players.');
      return;
    }

    if (!Number.isInteger(Number(tMax)) || Number(tMax) > 256) {
      setNotice('Maximum players must be a whole number between 2 and 256.');
      return;
    }

    setLoading(true);

    try {
      const image = await uploadEfootballImage(user, poster, 'tournaments');

      const data = await efootballAction<{ id: string }>(user, {
        action: 'submit_tournament',
        name: tName.trim(),
        poster_url: image,
        max_members: Number(tMax),
        room_number: room.trim(),
        instructions: tInstructions.trim()
      });

      openWhatsApp(`CHUKA EFOOTBALL — TOURNAMENT APPROVAL
Submission: ${data.id}
Name: ${tName}
Max members: ${tMax}
Room: ${room}
Poster: ${image}
Please review and publish.`);

      setShowTournament(false);
      setNotice('Tournament submitted for admin approval. It will appear after approval.');
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : 'Could not submit tournament.'
      );
    } finally {
      setLoading(false);
    }
  };

  const contact = async (
    id: string,
    kind: 'player' | 'market' = 'player'
  ) => {
    if (!user) {
      onSignIn();
      return;
    }

    if (!isMember) {
      setNotice('Only approved Chuka Efootball members can request player contact.');
      return;
    }

    setLoading(true);

    try {
      const result = await efootballAction<{ whatsapp: string }>(user, {
        action: 'get_contact',
        listing_id: id,
        listing_type: kind
      });

      let number = result.whatsapp.replace(/\D/g, '');

      if (number.startsWith('0')) {
        number = '254' + number.slice(1);
      }

      if (number.length === 9 && number.startsWith('7')) {
        number = '254' + number;
      }

      if (!number) {
        throw new Error('The registered WhatsApp number is invalid.');
      }

      window.open(
        `https://wa.me/${number}`,
        '_blank',
        'noopener,noreferrer'
      );

      setNotice('Opening the registered WhatsApp contact.');
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : 'Could not retrieve contact details.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="ef-wrap">
      <div className="ef-hero">
        <div className="ef-mark">
          <Gamepad2 size={30} />
        </div>

        <div>
          <span className="section-kicker">CHUKA COMRADES GAMING</span>
          <h1>Chuka Efootball</h1>
          <p>Find opponents, trade accounts and compete in campus tournaments.</p>
        </div>

        <button
          className="ef-refresh"
          onClick={() => void refresh()}
          aria-label="Refresh"
        >
          <RefreshCw size={17} />
        </button>
      </div>

      <div className="ef-actions">
        <button onClick={() => setShowRegister(true)}>
          <Users size={17} /> List my player profile · KSh 30
        </button>

        <button onClick={() => setShowMarket(true)}>
          <ShoppingBag size={17} /> Buy / sell account
        </button>

        <button
          onClick={() => {
            if (!user) {
              onSignIn();
            } else if (!isMember) {
              setNotice('Only approved Efootball members can submit tournaments.');
            } else {
              setShowTournament(true);
            }
          }}
        >
          <Trophy size={17} /> Create tournament
        </button>

        <a
          href={`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent('Hello Chuka Efootball admin, please share the official community WhatsApp group invite.')}`}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={17} /> WhatsApp group
        </a>
      </div>

      <div className="ef-tabs">
        <button
          className={tab === 'players' ? 'active' : ''}
          onClick={() => setTab('players')}
        >
          Players
        </button>

        <button
          className={tab === 'market' ? 'active' : ''}
          onClick={() => setTab('market')}
        >
          Account market
        </button>

        <button
          className={tab === 'tournaments' ? 'active' : ''}
          onClick={() => setTab('tournaments')}
        >
          Tournaments
        </button>
      </div>

      {notice && (
        <div className="ef-notice" role="status">
          {notice}
          <button onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}

      {tab === 'players' && (
        <>
          <div className="ef-heading">
            <div>
              <h2>Player listings</h2>
              <p>Browse approved players and their squads.</p>
            </div>
            <span>{players.length} listed</span>
          </div>

          {players.length === 0 ? (
            <div className="ef-empty">
              <Gamepad2 size={30} />
              <strong>No approved players yet</strong>
              <span>Be among the first to list your eFootball profile.</span>
            </div>
          ) : (
            <div className="ef-grid">
              {players.map(p => (
                <article className="ef-card" key={p.id}>
                  {p.squad_image_url && (
                    <img
                      className="ef-squad"
                      src={p.squad_image_url}
                      alt={`${p.username} squad`}
                    />
                  )}

                  <div className="ef-card-body">
                    <strong>{p.username}</strong>
                    <span className="ef-chip">Player profile</span>

                    <button onClick={() => void contact(p.id)}>
                      <MessageCircle size={16} />
                      {isMember ? 'Contact on WhatsApp' : 'Members only contact'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'market' && (
        <>
          <div className="ef-heading">
            <div>
              <h2>eFootball account market</h2>
              <p>Browse account offers and requests. Contact details are not shown publicly.</p>
            </div>
            <span>{market.length} listings</span>
          </div>

          {market.length === 0 ? (
            <div className="ef-empty">
              <ShoppingBag size={30} />
              <strong>No approved account listings yet</strong>
              <span>Submit a buy or sell request for admin review.</span>
              <button
                className="ef-primary"
                onClick={() => setShowMarket(true)}
              >
                Create a buy / sell listing
              </button>
            </div>
          ) : (
            <div className="ef-grid">
              {market.map(p => (
                <article className="ef-card" key={p.id}>
                  {p.market_image_url && (
                    <img
                      className="ef-squad ef-market-image"
                      src={p.market_image_url}
                      alt={`${p.username} account listing`}
                    />
                  )}

                  <div className="ef-card-body">
                    <span className="ef-chip">
                      {p.listing_type === 'sell'
                        ? 'Account for sale'
                        : 'Looking to buy'}
                    </span>

                    <strong>{p.username}</strong>

                    {p.asking_price != null && (
                      <b>KSh {p.asking_price.toLocaleString()}</b>
                    )}

                    <p>{p.description}</p>

                    <button onClick={() => void contact(p.id, 'market')}>
                      <MessageCircle size={16} />
                      {isMember ? 'Contact on WhatsApp' : 'Members only contact'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'tournaments' && (
        <>
          <div className="ef-heading">
            <div>
              <h2>Open tournaments</h2>
              <p>Join a room, compete and check the announced winners.</p>
            </div>
            <span>{tournaments.length} active</span>
          </div>

          {tournaments.length === 0 ? (
            <div className="ef-empty">
              <Trophy size={30} />
              <strong>No active tournaments</strong>
              <span>Create one and invite Chuka players to join.</span>

              <button
                className="ef-primary"
                onClick={() => {
                  if (!user) {
                    onSignIn();
                  } else if (!isMember) {
                    setNotice('Only approved Efootball members can submit tournaments.');
                  } else {
                    setShowTournament(true);
                  }
                }}
              >
                Create tournament
              </button>
            </div>
          ) : (
            <div className="ef-grid">
              {tournaments.map(t => {
                const details = tournamentDetails[t.id];

                return (
                  <article className="ef-card" key={t.id}>
                    {t.poster_url && (
                      <img
                        className="ef-squad"
                        src={t.poster_url}
                        alt={t.name}
                      />
                    )}

                    <div className="ef-card-body">
                      <strong>{t.name}</strong>

                      <span>
                        {t.max_members} maximum players · {t.status}
                      </span>

                      {isMember ? (
                        details ? (
                          <>
                            <p>
                              Room: <b>{details.room_number}</b>{' '}
                              <button
                                className="ef-copy"
                                onClick={() => {
                                  void navigator.clipboard
                                    .writeText(details.room_number)
                                    .then(() => setNotice('Room number copied.'))
                                    .catch(() => setNotice('Could not copy room number. Please copy it manually.'));
                                }}
                              >
                                Copy room number
                              </button>
                            </p>

                            {details.instructions && (
                              <small>{details.instructions}</small>
                            )}
                          </>
                        ) : (
                          <button
                            className="ef-copy"
                            disabled={loading}
                            onClick={() => void showTournamentDetails(t.id)}
                          >
                            {loading ? 'Loading details…' : 'View room details'}
                          </button>
                        )
                      ) : (
                        <small>
                          Approved Efootball members can view room details.
                        </small>
                      )}

                      {t.winner && <b>Winner: {t.winner}</b>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="ef-privacy">
        <LockKeyhole size={17} />
        <span>
          Privacy: player WhatsApp numbers are not displayed in public listings.
          Contact access is reserved for approved members. Tournament room
          details are also restricted to approved members. Never pay an account
          seller before verifying ownership.
        </span>
      </div>

      {showRegister && (
        <Modal
          title="List your eFootball player profile"
          close={() => setShowRegister(false)}
        >
          <p className="ef-step">
            Do you have an eFootball account? This listing is for existing players.
          </p>

          <label>
            eFootball username
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Your in-game username"
            />
          </label>

          <label>
            WhatsApp number
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 07XX XXX XXX"
            />
          </label>

          <label>
            Squad screenshot
            <input
              type="file"
              accept="image/*"
              onChange={e => setSquad(e.target.files?.[0] || null)}
            />
          </label>

          <label>
            M-Pesa transaction code
            <input
              value={mpesa}
              onChange={e => setMpesa(e.target.value)}
              placeholder="Enter code after paying"
            />
          </label>

          <div className="ef-payment">
            <b>Listing fee: KSh 30</b>
            <p>
              Pay KSh 30 to M-Pesa Till Number <strong>{TILL}</strong>, enter
              your transaction code, then submit. WhatsApp will open with a
              pre-filled verification message to the admin at +254 180 752220.
              Tap Send in WhatsApp; the admin verifies the Till payment before
              publishing your profile.
            </p>
          </div>

          <button
            className="ef-primary"
            disabled={loading}
            onClick={() => void submitPlayer()}
          >
            {loading ? 'Submitting…' : 'Submit for approval'}
          </button>
        </Modal>
      )}

      {showMarket && (
        <Modal
          title="List an eFootball account"
          close={() => setShowMarket(false)}
        >
          <label>
            Listing type
            <select
              value={marketType}
              onChange={e => setMarketType(e.target.value as 'buy' | 'sell')}
            >
              <option value="sell">I want to sell an account</option>
              <option value="buy">I want to buy an account</option>
            </select>
          </label>

          <label>
            eFootball username / preferred account
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Account username or target"
            />
          </label>

          <label>
            Price in KSh (optional)
            <input
              type="number"
              min="0"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="Negotiable"
            />
          </label>

          <label>
            Account details / requirements
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe account level, players, coins or what you need…"
            />
          </label>

          <label>
            Account image (optional)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={e => setMarketImage(e.target.files?.[0] || null)}
            />
          </label>

          <p className="ef-step">
            Your listing is reviewed before publication. Phone numbers stay
            private; approved members can request contact through the app.
          </p>

          <button
            className="ef-primary"
            disabled={loading}
            onClick={() => void submitMarket()}
          >
            {loading ? 'Submitting…' : 'Submit listing for approval'}
          </button>
        </Modal>
      )}

      {showTournament && (
        <Modal
          title="Create an eFootball tournament"
          close={() => setShowTournament(false)}
        >
          <label>
            Tournament name
            <input
              value={tName}
              onChange={e => setTName(e.target.value)}
              placeholder="e.g. Chuka Weekend Cup"
            />
          </label>

          <label>
            Tournament poster
            <input
              type="file"
              accept="image/*"
              onChange={e => setPoster(e.target.files?.[0] || null)}
            />
          </label>

          <label>
            Maximum members
            <input
              type="number"
              min="2"
              max="256"
              value={tMax}
              onChange={e => setTMax(e.target.value)}
            />
          </label>

          <label>
            Room number
            <input
              value={room}
              onChange={e => setRoom(e.target.value)}
              placeholder="eFootball room number"
            />
          </label>

          <label>
            Joining instructions (optional)
            <textarea
              value={tInstructions}
              onChange={e => setTInstructions(e.target.value)}
              placeholder="Rules, start time and joining details"
            />
          </label>

          <p className="ef-step">
            Tournaments are reviewed by an admin before they appear. Admins
            announce winners and close completed tournaments.
          </p>

          <button
            className="ef-primary"
            disabled={loading}
            onClick={() => void submitTournament()}
          >
            {loading ? 'Submitting…' : 'Submit tournament'}
          </button>
        </Modal>
      )}
    </section>
  );
}

function Modal({
  title,
  close,
  children
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="ef-overlay"
      role="presentation"
      onMouseDown={e => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="ef-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="ef-modal-head">
          <h2>{title}</h2>
          <button onClick={close}>
            <X size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
