# Configurer le SMTP de Supabase Auth — procédure

Objectif : supprimer le plafond de quelques liens de connexion par heure, qui est **partagé par
toute l'équipe** et vide dès le matin.

Rien de tout ceci ne se fait dans le code. Tout est dans le tableau de bord Supabase et dans la
console Google. **Je ne saisis aucun mot de passe ni clé : c'est Naoëlle ou Michel qui applique.**

Rédigé le 16/08/2026.

---

## 1. Créer une boîte d'envoi dédiée (Google Admin)

Créez `no-reply@kiwee-energie.fr` — **pas** l'adresse d'une personne.

Pourquoi : les liens de connexion partiraient sinon au nom de Naoëlle, les réponses
automatiques et les rebonds arriveraient dans sa boîte, et le jour où elle quitte le poste
l'authentification de tout le monde tombe avec son compte.

## 2. Obtenir un mot de passe d'application (Google)

Sur le compte `no-reply@` :

1. Activer la **validation en deux étapes** — sans elle, Google ne propose pas de mot de passe
   d'application du tout.
2. Aller dans **Compte Google → Sécurité → Mots de passe des applications**.
3. Créer un mot de passe pour « Supabase ». Google affiche **16 caractères en 4 groupes**.
4. Le copier **sans les espaces**.

> **Premier piège.** Le mot de passe habituel du compte ne fonctionne pas : Google refuse
> l'authentification SMTP simple depuis 2022. Il faut un mot de passe d'application.
>
> **Si l'option n'apparaît pas** : votre organisation impose probablement la connexion par SSO,
> qui bloque les mots de passe d'application. Dans ce cas, passez au **SMTP Relay** de Google
> Workspace (Admin → Applications → Google Workspace → Gmail → Routing → SMTP relay service),
> ou prenez un service d'envoi transactionnel — c'est de toute façon plus robuste pour de
> l'authentification.

## 3. Brancher le SMTP dans Supabase

**Dashboard → Project Settings → Authentication → SMTP Settings** → activer *Enable Custom SMTP*.

| Champ | Valeur |
|---|---|
| Sender email | `no-reply@kiwee-energie.fr` |
| Sender name | `Kimatch` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | `no-reply@kiwee-energie.fr` (l'adresse complète) |
| Password | le mot de passe d'application à 16 caractères |

Notes :

- **Port 465** plutôt que 587. Les deux marchent, mais 465 (SSL implicite) évite les échecs
  silencieux de négociation STARTTLS qu'on voit régulièrement sur 587.
- **Sender email doit être l'adresse authentifiée.** Si vous mettez une autre adresse sans
  l'avoir déclarée en « Envoyer des e-mails en tant que » côté Google, Google la réécrit ou
  rejette l'envoi.

## 4. Relever la limite — l'étape qu'on oublie

**Dashboard → Authentication → Rate Limits → « Rate limit for sending emails ».**

> **Second piège, et c'est le plus important.** Brancher le SMTP **ne lève pas le plafond tout
> seul**. Supabase applique toujours sa propre limite horaire par-dessus votre SMTP. Si vous vous
> arrêtez à l'étape 3, le problème reste entier.

Pour 10 utilisateurs, quelque chose comme **150 par heure** laisse largement de la marge sans
ouvrir la porte à un abus si l'adresse de connexion fuitait.

## 5. Vérifier les URL de redirection

**Dashboard → Authentication → URL Configuration.**

`src/lib/auth.tsx` envoie `emailRedirectTo: window.location.origin`. Cette origine doit figurer
dans **Redirect URLs**, sinon le lien ramène sur l'URL par défaut du site au lieu de la page
d'où l'utilisateur venait :

- `https://kimatch.fr/**`
- `http://localhost:5173/**` (pour le développement)

## 6. Tester

1. Demander un lien depuis `https://kimatch.fr/login` avec une adresse réelle.
2. Vérifier l'expéditeur : le mail doit venir de `no-reply@kiwee-energie.fr`, **pas** de
   `noreply@mail.app.supabase.io`. C'est le seul contrôle qui prouve que le SMTP est bien pris
   en compte.
3. Regarder les indésirables au premier envoi.
4. Enchaîner 5 demandes sur 5 adresses différentes : aucune ne doit être refusée.

> Le délai de **60 secondes entre deux demandes pour la même adresse** subsiste — c'est une
> limite distincte du plafond horaire, et elle est saine. L'écran de connexion l'affiche
> désormais en décompte (commit du 16/08/2026), au lieu de laisser recliquer dans le vide.

---

## Ce qui reste hors périmètre

Le **Send Email Hook** (Supabase appelle notre code au lieu d'envoyer lui-même) n'est *pas*
nécessaire pour lever le plafond. Il ne devient utile que pour maîtriser le gabarit des e-mails
ou passer par un service d'envoi avec suivi de délivrabilité. À voir après, si le besoin se
présente.
