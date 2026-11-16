import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

const ISSUER_ROLE = ethers.id("ISSUER_ROLE");
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
const ONE_DAY = 24 * 60 * 60;

const fileHash = (label: string) => ethers.sha256(ethers.toUtf8Bytes(label));
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

async function deployFixture() {
  const [admin, issuer, otherIssuer, holder, stranger] = await ethers.getSigners();
  const sertiChain = await ethers.deployContract("SertiChain", [admin.address]);
  await sertiChain.connect(admin).addIssuer(issuer.address);
  await sertiChain.connect(admin).addIssuer(otherIssuer.address);

  const latest = await ethers.provider.getBlock("latest");
  const eventDate = BigInt(latest!.timestamp - ONE_DAY);

  return { sertiChain, admin, issuer, otherIssuer, holder, stranger, eventDate };
}

async function issuedFixture() {
  const ctx = await deployFixture();
  const { sertiChain, issuer, holder, eventDate } = ctx;
  await sertiChain
    .connect(issuer)
    .issueCertificate(holder.address, "Seminar Blockchain 2026", "Seminar", eventDate, fileHash("cert-1"), CID);
  return { ...ctx, id: 1n };
}

describe("SertiChain", function () {
  describe("deployment", function () {
    it("grants the admin role to the constructor argument", async function () {
      const { sertiChain, admin } = await deployFixture();
      expect(await sertiChain.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
    });

    it("rejects a zero admin address", async function () {
      const factory = await ethers.getContractFactory("SertiChain");
      await expect(ethers.deployContract("SertiChain", [ethers.ZeroAddress])).to.be.revertedWithCustomError(
        factory,
        "ZeroAddress",
      );
    });

    it("advertises ERC-721, ERC-5192 and AccessControl interfaces", async function () {
      const { sertiChain } = await deployFixture();
      expect(await sertiChain.supportsInterface("0x80ac58cd")).to.equal(true); // ERC-721
      expect(await sertiChain.supportsInterface("0xb45a3c0e")).to.equal(true); // ERC-5192
      expect(await sertiChain.supportsInterface("0x7965db0b")).to.equal(true); // AccessControl
    });
  });

  describe("issuer management", function () {
    it("lets the admin add and remove issuers", async function () {
      const { sertiChain, admin, stranger } = await deployFixture();
      await expect(sertiChain.connect(admin).addIssuer(stranger.address))
        .to.emit(sertiChain, "IssuerAdded")
        .withArgs(stranger.address, admin.address);
      expect(await sertiChain.hasRole(ISSUER_ROLE, stranger.address)).to.equal(true);

      await expect(sertiChain.connect(admin).removeIssuer(stranger.address))
        .to.emit(sertiChain, "IssuerRemoved")
        .withArgs(stranger.address, admin.address);
      expect(await sertiChain.hasRole(ISSUER_ROLE, stranger.address)).to.equal(false);
    });

    it("blocks non-admins from adding issuers", async function () {
      const { sertiChain, issuer, stranger } = await deployFixture();
      await expect(sertiChain.connect(issuer).addIssuer(stranger.address))
        .to.be.revertedWithCustomError(sertiChain, "AccessControlUnauthorizedAccount")
        .withArgs(issuer.address, DEFAULT_ADMIN_ROLE);
    });

    it("never lets an admin hold the issuer role, even through grantRole", async function () {
      const { sertiChain, admin, issuer } = await deployFixture();
      await expect(sertiChain.connect(admin).addIssuer(admin.address))
        .to.be.revertedWithCustomError(sertiChain, "AdminCannotBeIssuer")
        .withArgs(admin.address);
      await expect(sertiChain.connect(admin).grantRole(ISSUER_ROLE, admin.address))
        .to.be.revertedWithCustomError(sertiChain, "AdminCannotBeIssuer")
        .withArgs(admin.address);
      await expect(sertiChain.connect(admin).grantRole(DEFAULT_ADMIN_ROLE, issuer.address))
        .to.be.revertedWithCustomError(sertiChain, "AdminCannotBeIssuer")
        .withArgs(issuer.address);
    });

    it("rejects a zero issuer address", async function () {
      const { sertiChain, admin } = await deployFixture();
      await expect(sertiChain.connect(admin).addIssuer(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        sertiChain,
        "ZeroAddress",
      );
    });
  });

  describe("issueCertificate", function () {
    it("mints a locked token to the holder and stores the record", async function () {
      const { sertiChain, issuer, holder, eventDate } = await deployFixture();
      const hash = fileHash("cert-1");

      await expect(
        sertiChain.connect(issuer).issueCertificate(holder.address, "Seminar Blockchain 2026", "Seminar", eventDate, hash, CID),
      )
        .to.emit(sertiChain, "CertificateIssued")
        .withArgs(1n, issuer.address, holder.address, hash)
        .and.to.emit(sertiChain, "Locked")
        .withArgs(1n);

      expect(await sertiChain.ownerOf(1n)).to.equal(holder.address);
      expect(await sertiChain.locked(1n)).to.equal(true);
      expect(await sertiChain.getCertificatesByOwner(holder.address)).to.deep.equal([1n]);
      expect(await sertiChain.certificateIdByFileHash(hash)).to.equal(1n);
      expect(await sertiChain.totalCertificates()).to.equal(1n);

      const cert = await sertiChain.getCertificate(1n);
      expect(cert.issuer).to.equal(issuer.address);
      expect(cert.recipient).to.equal(holder.address);
      expect(cert.title).to.equal("Seminar Blockchain 2026");
      expect(cert.fileHash).to.equal(hash);
      expect(cert.fileCID).to.equal(CID);
      expect(cert.revoked).to.equal(false);
    });

    it("rejects callers without the issuer role, admin included", async function () {
      const { sertiChain, admin, holder, stranger, eventDate } = await deployFixture();
      for (const caller of [admin, stranger, holder]) {
        await expect(
          sertiChain.connect(caller).issueCertificate(holder.address, "T", "Seminar", eventDate, fileHash("x"), CID),
        )
          .to.be.revertedWithCustomError(sertiChain, "AccessControlUnauthorizedAccount")
          .withArgs(caller.address, ISSUER_ROLE);
      }
    });

    it("rejects invalid input", async function () {
      const { sertiChain, issuer, holder, eventDate } = await deployFixture();
      const issue = (to: string, title: string, date: bigint, hash: string, cid: string) =>
        sertiChain.connect(issuer).issueCertificate(to, title, "Seminar", date, hash, cid);
      const future = eventDate + BigInt(10 * ONE_DAY);

      await expect(issue(ethers.ZeroAddress, "T", eventDate, fileHash("a"), CID)).to.be.revertedWithCustomError(sertiChain, "ZeroAddress");
      await expect(issue(issuer.address, "T", eventDate, fileHash("a"), CID)).to.be.revertedWithCustomError(sertiChain, "SelfIssuance");
      await expect(issue(holder.address, "", eventDate, fileHash("a"), CID))
        .to.be.revertedWithCustomError(sertiChain, "EmptyField")
        .withArgs("title");
      await expect(issue(holder.address, "x".repeat(201), eventDate, fileHash("a"), CID))
        .to.be.revertedWithCustomError(sertiChain, "TextTooLong")
        .withArgs("title");
      await expect(issue(holder.address, "T", 0n, fileHash("a"), CID)).to.be.revertedWithCustomError(sertiChain, "InvalidEventDate");
      await expect(issue(holder.address, "T", future, fileHash("a"), CID)).to.be.revertedWithCustomError(sertiChain, "InvalidEventDate");
      await expect(issue(holder.address, "T", eventDate, ethers.ZeroHash, CID)).to.be.revertedWithCustomError(sertiChain, "EmptyFileHash");
      await expect(issue(holder.address, "T", eventDate, fileHash("a"), ""))
        .to.be.revertedWithCustomError(sertiChain, "EmptyField")
        .withArgs("fileCID");
    });

    it("rejects a file hash that already backs a certificate", async function () {
      const { sertiChain, otherIssuer, holder, eventDate } = await issuedFixture();
      await expect(
        sertiChain.connect(otherIssuer).issueCertificate(holder.address, "Copy", "Seminar", eventDate, fileHash("cert-1"), CID),
      )
        .to.be.revertedWithCustomError(sertiChain, "DuplicateFileHash")
        .withArgs(1n);
    });

    it("is blocked while paused", async function () {
      const { sertiChain, admin, issuer, holder, eventDate } = await deployFixture();
      await sertiChain.connect(admin).pause();
      await expect(
        sertiChain.connect(issuer).issueCertificate(holder.address, "T", "Seminar", eventDate, fileHash("p"), CID),
      ).to.be.revertedWithCustomError(sertiChain, "EnforcedPause");
    });
  });

  describe("updateCertificate", function () {
    it("lets the original issuer fix descriptive fields", async function () {
      const { sertiChain, issuer, id, eventDate } = await issuedFixture();
      await expect(sertiChain.connect(issuer).updateCertificate(id, "Seminar Blockchain Fundamental 2026", "Seminar", eventDate))
        .to.emit(sertiChain, "CertificateUpdated")
        .withArgs(id, issuer.address);
      expect((await sertiChain.getCertificate(id)).title).to.equal("Seminar Blockchain Fundamental 2026");
    });

    it("rejects another issuer", async function () {
      const { sertiChain, otherIssuer, id, eventDate } = await issuedFixture();
      await expect(sertiChain.connect(otherIssuer).updateCertificate(id, "Hijack", "Seminar", eventDate))
        .to.be.revertedWithCustomError(sertiChain, "NotCertificateIssuer")
        .withArgs(id, otherIssuer.address);
    });

    it("rejects a revoked certificate", async function () {
      const { sertiChain, issuer, id, eventDate } = await issuedFixture();
      await sertiChain.connect(issuer).revokeCertificate(id, "Data peserta salah");
      await expect(sertiChain.connect(issuer).updateCertificate(id, "New", "Seminar", eventDate))
        .to.be.revertedWithCustomError(sertiChain, "CertificateAlreadyRevoked")
        .withArgs(id);
    });

    it("rejects an unknown id", async function () {
      const { sertiChain, issuer, eventDate } = await issuedFixture();
      await expect(sertiChain.connect(issuer).updateCertificate(99n, "T", "Seminar", eventDate))
        .to.be.revertedWithCustomError(sertiChain, "CertificateNotFound")
        .withArgs(99n);
    });
  });

  describe("revokeCertificate", function () {
    it("lets the original issuer revoke and records the reason", async function () {
      const { sertiChain, issuer, id } = await issuedFixture();
      await expect(sertiChain.connect(issuer).revokeCertificate(id, "Peserta tidak hadir"))
        .to.emit(sertiChain, "CertificateRevoked")
        .withArgs(id, issuer.address, "Peserta tidak hadir");

      const cert = await sertiChain.getCertificate(id);
      expect(cert.revoked).to.equal(true);
      expect(cert.revokeReason).to.equal("Peserta tidak hadir");
      expect(cert.revokedAt).to.be.greaterThan(0n);
    });

    it("lets an admin revoke any certificate", async function () {
      const { sertiChain, admin, id } = await issuedFixture();
      await expect(sertiChain.connect(admin).revokeCertificate(id, "Kecurangan"))
        .to.emit(sertiChain, "CertificateRevoked")
        .withArgs(id, admin.address, "Kecurangan");
    });

    it("rejects other issuers, holders and strangers", async function () {
      const { sertiChain, otherIssuer, holder, stranger, id } = await issuedFixture();
      for (const caller of [otherIssuer, holder, stranger]) {
        await expect(sertiChain.connect(caller).revokeCertificate(id, "x"))
          .to.be.revertedWithCustomError(sertiChain, "NotAllowedToRevoke")
          .withArgs(id, caller.address);
      }
    });

    it("rejects an issuer whose role was removed", async function () {
      const { sertiChain, admin, issuer, id } = await issuedFixture();
      await sertiChain.connect(admin).removeIssuer(issuer.address);
      await expect(sertiChain.connect(issuer).revokeCertificate(id, "x"))
        .to.be.revertedWithCustomError(sertiChain, "NotAllowedToRevoke")
        .withArgs(id, issuer.address);
    });

    it("rejects a second revoke and an empty reason", async function () {
      const { sertiChain, issuer, id } = await issuedFixture();
      await expect(sertiChain.connect(issuer).revokeCertificate(id, ""))
        .to.be.revertedWithCustomError(sertiChain, "EmptyField")
        .withArgs("reason");
      await sertiChain.connect(issuer).revokeCertificate(id, "Duplikat");
      await expect(sertiChain.connect(issuer).revokeCertificate(id, "Lagi"))
        .to.be.revertedWithCustomError(sertiChain, "CertificateAlreadyRevoked")
        .withArgs(id);
    });
  });

  describe("verifyFile", function () {
    it("returns true only for a matching hash on an active certificate", async function () {
      const { sertiChain, issuer, id } = await issuedFixture();
      expect(await sertiChain.verifyFile(id, fileHash("cert-1"))).to.equal(true);
      expect(await sertiChain.verifyFile(id, fileHash("tampered"))).to.equal(false);
      expect(await sertiChain.verifyFile(99n, fileHash("cert-1"))).to.equal(false);

      await sertiChain.connect(issuer).revokeCertificate(id, "Dicabut");
      expect(await sertiChain.verifyFile(id, fileHash("cert-1"))).to.equal(false);
    });
  });

  describe("soulbound", function () {
    it("blocks transfers by the holder", async function () {
      const { sertiChain, holder, stranger, id } = await issuedFixture();
      await expect(
        sertiChain.connect(holder).transferFrom(holder.address, stranger.address, id),
      ).to.be.revertedWithCustomError(sertiChain, "Soulbound");
      await expect(
        sertiChain.connect(holder)["safeTransferFrom(address,address,uint256)"](holder.address, stranger.address, id),
      ).to.be.revertedWithCustomError(sertiChain, "Soulbound");
    });

    it("blocks approvals", async function () {
      const { sertiChain, holder, stranger, id } = await issuedFixture();
      await expect(sertiChain.connect(holder).approve(stranger.address, id)).to.be.revertedWithCustomError(sertiChain, "Soulbound");
      await expect(sertiChain.connect(holder).setApprovalForAll(stranger.address, true)).to.be.revertedWithCustomError(
        sertiChain,
        "Soulbound",
      );
    });

    it("reverts locked() for a token that does not exist", async function () {
      const { sertiChain } = await deployFixture();
      await expect(sertiChain.locked(1n)).to.be.revertedWithCustomError(sertiChain, "ERC721NonexistentToken").withArgs(1n);
    });
  });

  describe("pause", function () {
    it("can only be toggled by the admin", async function () {
      const { sertiChain, admin, issuer } = await deployFixture();
      await expect(sertiChain.connect(issuer).pause())
        .to.be.revertedWithCustomError(sertiChain, "AccessControlUnauthorizedAccount")
        .withArgs(issuer.address, DEFAULT_ADMIN_ROLE);
      await sertiChain.connect(admin).pause();
      expect(await sertiChain.paused()).to.equal(true);
      await sertiChain.connect(admin).unpause();
      expect(await sertiChain.paused()).to.equal(false);
    });
  });
});
