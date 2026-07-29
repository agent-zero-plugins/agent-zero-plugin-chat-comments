# Hard rules (binding):
# 1. Behaviour, not implementation — no selectors/stores/DOM ids here; the "how" lives in steps/.
# 2. Real triggers — real UI drives or the plugin's public entry points; no internal state-poking.
# 3. No silent swallow — every scenario asserts a falsifiable end state.
# 4. No fake green — @skip only with a tracked reason.
# 5. Hermetic — no LLM, no external services.
Feature: Commenting on a chat

  Scenario: The comments control is present   # BEH-1, UI-1
    Given I am in a chat
    Then a comments control is available in the chat toolbar

  Scenario: A comment added to a chat is remembered   # BEH-2, BEH-11, BEH-12
    Given I am in a chat
    When I add a comment to the chat
    Then the chat shows it has one comment
    And the comment is still there after a reload

  Scenario: A comment can be attached to selected message text   # BEH-5, BEH-7, BEH-8
    Given I am in a chat
    And the chat contains a message from me
    When I comment on a phrase inside that message
    Then the phrase is highlighted in the message
    And the comment records which text it refers to

  Scenario: A comment carries its attribution and creation time   # BEH-8, BEH-11
    Given I am in a chat
    And the chat contains a message from me
    When I comment on a phrase inside that message
    Then the comment list attributes the comment to the quoted text
    And the stored comment carries a creation timestamp

  Scenario: A comment can be edited   # BEH-10
    Given I am in a chat
    And the chat contains a message from me
    And I have commented on a phrase inside that message
    When I change the comment's note
    Then the comment shows the updated note
    And the updated note survives a reload

  Scenario: A comment can be deleted   # BEH-10
    Given I am in a chat
    When I add a comment to the chat
    And I delete that comment
    Then the chat shows it has no comments
    And the comment is gone after a reload

  Scenario: Comments stay with their chat when I switch away and back   # BEH-3
    Given I am in a chat
    When I add a comment to the chat
    And I switch to a different chat
    Then that chat shows no comments
    When I switch back to the first chat
    Then the chat shows it has one comment

  Scenario: One message can carry several comments   # BEH-8, BEH-9
    Given I am in a chat
    And the chat contains a message from me
    When I comment on two different phrases inside that message
    Then both phrases are highlighted in the message
    And the chat shows it has two comments

  Scenario: Both my messages and agent replies can be commented   # BEH-5, BEH-8
    Given I am in a chat
    And the chat contains a message from me and a reply from the agent
    When I comment on a phrase in each of them
    Then the chat shows it has two comments
    And each commented phrase is highlighted in its own message

  Scenario: An empty comment is not accepted   # BEH-8, BEH-12, EC-6
    Given I am in a chat
    When I try to add an empty comment
    Then the chat shows it has no comments

  Scenario: The comments service rejects malformed requests   # BEH-11, EC-4
    Given I am in a chat
    When the comments service is asked without saying which chat
    Then it refuses the request as invalid
    When the comments service is asked about a chat that does not exist
    Then it reports the chat as not found
    When the comments service is given comments that are not a list
    Then it refuses the request as invalid

  @skip
  Scenario: Comments can be sent to the prompt box   # BEH-13, BEH-14
    # env: the fork's no-LLM composer does not mount the prompt textarea (agent-zero-plugin-chat-comments#send-fork-composer),
    # so prompt insertion no-ops there; verified on stock A0 locally + covered in the design docs.
    Given I am in a chat
    When I add a comment to the chat
    And I send the comments to the prompt box
    Then the prompt box contains my comment
