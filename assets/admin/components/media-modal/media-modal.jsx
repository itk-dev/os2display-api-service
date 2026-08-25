import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "react-bootstrap/Modal";
import ModalDialog from "../util/modal/modal-dialog";
import MediaList from "../media/media-list";
import useModal from "../../context/modal-context/modal-context-hook";

/**
 * Media modal component.
 *
 * @param {object} props Props.
 * @param {boolean} props.show Whether to show the modal.
 * @param {Function} props.onClose Callback on close modal.
 * @param {Function} props.handleAccept The are you sure you want to delete text.
 * @param {boolean} props.multiple Whether it should be possible to choose
 *   multiple images.
 * @returns {object} The modal.
 */
function MediaModal({ show, onClose, handleAccept, multiple }) {
  const { t } = useTranslation("common");
  const { selected } = useModal();

  if (!show) {
    return <></>;
  }

  // @TODO: This effect runs after the `if (!show)` early return above, so the
  // hook order changes when `show` flips. Restructure so the effect is
  // unconditional. Needs a test; tracked as a follow-up issue.
  // eslint-disable-next-line @eslint-react/rules-of-hooks
  useEffect(() => {
    if (selected && selected.length > 0) {
      handleAccept(selected);
    }
  }, [selected]);

  return (
    <Modal
      animation={false}
      show={show}
      size="xl"
      id="media-modal"
      onHide={onClose}
    >
      <ModalDialog
        title={t("media-modal.multiple-select-title")}
        onClose={onClose}
        handleAccept={() => handleAccept(selected)}
      >
        <MediaList fromModal multiple={multiple} />
      </ModalDialog>
    </Modal>
  );
}

export default MediaModal;
